"""
FileShare Transfer Service
Business logic for file uploads, downloads, token refresh, and deletion.
Coordinates between DatabaseManager and StorageManager without coupling them.

Concurrency safety:
- Download counting is done with a single atomic UPDATE that enforces
  the limit inside the database, so concurrent downloads can never
  exceed max_downloads.
- Token refresh uses the same atomic UPDATE + RETURNING pattern.
"""

import os
from datetime import timedelta

from api.database import DatabaseManager
from api.storage import StorageManager
from api.config import (
    MAX_FILE_SIZE, PER_USER_MAX_STORAGE, MAX_SYSTEM_STORAGE, MAX_SYSTEM_USERS,
    MAX_FILES_PER_TRANSFER, MAX_REFRESHES_PER_SESSION, MAX_PREVIEWS_PER_FILE, DEFAULT_MAX_DOWNLOADS
)
from api.utils import generate_id, generate_owner_token, hash_token, tokens_match, proofs_match, get_utc_now, get_utc_now_iso, is_expired
from api.errors import ApiError, NotFoundError, GoneError, ConflictError, ForbiddenError, ValidationError, PayloadTooLargeError

MAX_ALLOWED_ENCRYPTED = MAX_FILE_SIZE + 64 * 1024 * 1024  # 1 GB + overhead


class TransferService:
    """Orchestrates file transfer operations across storage and database layers."""

    def __init__(self, db_manager: DatabaseManager, storage_manager: StorageManager):
        self.db = db_manager
        self.storage = storage_manager

    def _get_total_storage_used(self) -> int:
        """Calculate total bytes currently stored in the system (files + chunks)."""
        conn = self.db.get_connection()
        try:
            row_files = conn.execute("SELECT SUM(encrypted_size) as total FROM files").fetchone()
            row_chunks = conn.execute("SELECT SUM(chunk_size) as total FROM chunks").fetchone()
            total = 0
            if row_files and row_files["total"]:
                total += row_files["total"]
            if row_chunks and row_chunks["total"]:
                total += row_chunks["total"]
            return total
        finally:
            conn.close()

    def get_user_storage_used(self, client_id: str) -> int:
        """Calculate total original bytes stored for a specific user."""
        if not client_id:
            return 0
        conn = self.db.get_connection()
        try:
            row = conn.execute(
                "SELECT COALESCE(SUM(original_size), 0) as total FROM files WHERE client_id = ? AND status != 'burned'",
                (client_id,)
            ).fetchone()
            return int(row["total"]) if row else 0
        finally:
            conn.close()

    def get_user_storage(self, client_id: str) -> dict:
        """Retrieve personal storage usage stats for an anonymous client ID."""
        client_id = (client_id or "anonymous").strip()
        used_bytes = self.get_user_storage_used(client_id)
        max_bytes = PER_USER_MAX_STORAGE
        rem_bytes = max(0, max_bytes - used_bytes)
        conn = self.db.get_connection()
        file_count = 0
        try:
            row = conn.execute(
                "SELECT COUNT(*) as count FROM files WHERE client_id = ? AND status != 'burned'",
                (client_id,)
            ).fetchone()
            file_count = int(row["count"]) if row else 0
        finally:
            conn.close()

        return {
            "client_id": client_id,
            "used_bytes": used_bytes,
            "used_mb": used_bytes // (1024 * 1024),
            "max_bytes": max_bytes,
            "max_mb": max_bytes // (1024 * 1024),
            "available_bytes": rem_bytes,
            "available_mb": rem_bytes // (1024 * 1024),
            "file_count": file_count
        }

    def check_user_quota(self, client_id: str, new_size: int):
        """Validate that adding new_size will not exceed the user's 1 GB personal quota."""
        client_id = (client_id or "anonymous").strip()
        used_bytes = self.get_user_storage_used(client_id)
        if used_bytes + new_size > PER_USER_MAX_STORAGE:
            used_mb = used_bytes // (1024 * 1024)
            rem_mb = max(0, (PER_USER_MAX_STORAGE - used_bytes) // (1024 * 1024))
            max_mb = PER_USER_MAX_STORAGE // (1024 * 1024)
            max_str = "1 GB" if max_mb == 1024 else f"{max_mb} MB"
            raise PayloadTooLargeError(
                f"Upload Failed\n1 GB personal storage limit exceeded!\n"
                f"Maximum allowed: {max_str}\n"
                f"Storage used: {used_mb} MB / {max_mb} MB\n"
                f"Available: {rem_mb} MB\n"
                f"Please delete old files using 'Clear My Storage' or wait for the 24-hour auto-reset."
            )

    def clear_user_storage(self, client_id: str) -> dict:
        """Manually purge all active files uploaded by this user and reset quota to 0 MB."""
        client_id = (client_id or "anonymous").strip()
        conn = self.db.get_connection()
        deleted_ids = []
        freed_bytes = 0
        try:
            rows = conn.execute(
                "SELECT id, original_size, transfer_id FROM files WHERE client_id = ?",
                (client_id,)
            ).fetchall()
            for r in rows:
                deleted_ids.append(r["id"])
                freed_bytes += int(r["original_size"] or 0)
                self.storage.delete_file(r["id"])
                if r["transfer_id"]:
                    self.storage.purge_transfer_chunks(r["transfer_id"])

            if deleted_ids:
                placeholders = ",".join("?" for _ in deleted_ids)
                conn.execute(f"DELETE FROM files WHERE id IN ({placeholders})", deleted_ids)
                conn.execute(f"DELETE FROM chunks WHERE file_id IN ({placeholders})", deleted_ids)

            t_rows = conn.execute("SELECT id FROM transfers WHERE client_id = ?", (client_id,)).fetchall()
            for tr in t_rows:
                self.storage.purge_transfer_chunks(tr["id"])
            conn.execute("DELETE FROM transfers WHERE client_id = ?", (client_id,))

            conn.commit()
        finally:
            conn.close()

        return {
            "message": "Personal storage cleared successfully",
            "deleted_files_count": len(deleted_ids),
            "freed_bytes": freed_bytes,
            "used_bytes": 0,
            "max_bytes": PER_USER_MAX_STORAGE
        }

    def _check_system_user_capacity(self, transfer_id: str = None):
        """Limit system to MAX_SYSTEM_USERS concurrent active transfers/users."""
        conn = self.db.get_connection()
        try:
            cursor = conn.execute(
                "SELECT COUNT(DISTINCT id) as count FROM transfers WHERE status IN ('active', 'uploading', 'ready') AND (expires_at IS NULL OR expires_at > ?)",
                (get_utc_now_iso(),)
            )
            row = cursor.fetchone()
            active_count = row["count"] if row else 0
            if transfer_id:
                existing = conn.execute("SELECT id FROM transfers WHERE id = ?", (transfer_id,)).fetchone()
                if existing:
                    return
            if active_count >= MAX_SYSTEM_USERS:
                raise ApiError(f"System user capacity reached (maximum {MAX_SYSTEM_USERS} concurrent users). Please try again shortly.", 429)
        finally:
            conn.close()

    # ─── Upload (Single Shot) ───────────────────────────────────────────────

    def upload_file(self, file_obj, form_data: dict) -> dict:
        """
        Upload an encrypted file blob in a single request.
        form_data must already be validated (see api.validation).
        Returns dict with file_id, transfer_id, share_url, expires_at, etc.
        """
        file_count = form_data.get("file_count", 1)
        if file_count > MAX_FILES_PER_TRANSFER:
            raise ValidationError(f"Maximum of {MAX_FILES_PER_TRANSFER} files allowed per transfer (got {file_count})")

        transfer_id = None
        self._check_system_user_capacity(transfer_id)

        original_size = form_data["original_size"]
        client_id = (form_data.get("client_id") or "anonymous").strip()
        self.check_user_quota(client_id, original_size)

        iv = form_data["iv"]
        salt = form_data["salt"]
        original_name = form_data["original_name"]
        original_size = form_data["original_size"]
        compressed = form_data["compressed"]
        max_downloads = form_data["max_downloads"]
        burn_on_read = form_data["burn_on_read"]
        expiry_hours = form_data["expiry_hours"]
        sharing_mode = form_data["sharing_mode"]
        checksum = (form_data.get("checksum") or "").strip()[:64]
        access_hash = form_data["access_hash"]
        wrapped_key = form_data.get("wrapped_key")
        wrap_iv = form_data.get("wrap_iv")

        file_id = form_data.get("file_id") or generate_id()
        transfer_id = form_data.get("transfer_id") or generate_id()
        owner_token = generate_owner_token()
        file_path = self.storage.get_file_path(file_id)

        # Stream write with size enforcement (never loads the entire blob into RAM)
        encrypted_size = 0
        try:
            with open(file_path, "wb") as f:
                while chunk := file_obj.read(262144):  # 256 KB write buffer for high-throughput streaming
                    encrypted_size += len(chunk)
                    if encrypted_size > MAX_ALLOWED_ENCRYPTED:
                        raise ValueError("Total file size cannot exceed 1 GB")
                    f.write(chunk)
        except Exception:
            self.storage.delete_file(file_id)
            raise

        now_utc = get_utc_now()
        created_at_iso = now_utc.isoformat()
        expires_at = now_utc + timedelta(seconds=form_data["expiry_seconds"])
        expires_at_iso = expires_at.isoformat()
        effective_max_downloads = max_downloads

        conn = self.db.get_connection()
        try:
            # Create transfer record (UPSERT so multi-file transfers accumulate)
            conn.execute("""
                INSERT INTO transfers (id, token_hash, client_id, status, created_at, expires_at, total_size, file_count, sharing_mode, refresh_count, max_refreshes, burn_on_read)
                VALUES (?, ?, ?, 'active', ?, ?, ?, 1, ?, 0, 5, ?)
                ON CONFLICT(id) DO UPDATE SET total_size = total_size + excluded.total_size, file_count = file_count + 1, client_id = COALESCE(client_id, excluded.client_id)
            """, (transfer_id, hash_token(owner_token), client_id, created_at_iso, expires_at_iso, original_size, sharing_mode, burn_on_read))

            # Insert file metadata
            conn.execute("""
                INSERT INTO files (id, transfer_id, client_id, filename, original_name, original_size, encrypted_size,
                                  mime_type, created_at, expires_at, download_count, max_downloads, max_previews, preview_count, iv, salt, compressed, checksum, burn_on_read, status, access_hash, wrapped_key, wrap_iv)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, ?, ?, ?, ?, 'ready', ?, ?, ?)
            """, (
                file_id, transfer_id, client_id, file_obj.filename or "file.encrypted", original_name, original_size, encrypted_size,
                file_obj.content_type or "application/octet-stream", created_at_iso, expires_at_iso,
                effective_max_downloads, MAX_PREVIEWS_PER_FILE, iv, salt, compressed, checksum, burn_on_read, access_hash, wrapped_key, wrap_iv
            ))

            conn.commit()
        except Exception:
            self.storage.delete_file(file_id)
            raise
        finally:
            conn.close()

        downloads_remaining = effective_max_downloads if effective_max_downloads > 0 else None

        return {
            "file_id": file_id,
            "transfer_id": transfer_id,
            "share_url": f"/download/{file_id}",
            "created_at": created_at_iso,
            "createdAt": created_at_iso,
            "expires_at": expires_at_iso,
            "expiresAt": expires_at_iso,
            "download_count": 0,
            "downloadCount": 0,
            "max_downloads": effective_max_downloads,
            "maxDownloads": effective_max_downloads,
            "downloads_remaining": downloads_remaining,
            "downloadsRemaining": downloads_remaining,
            "preview_count": 0,
            "previewCount": 0,
            "max_previews": MAX_PREVIEWS_PER_FILE,
            "maxPreviews": MAX_PREVIEWS_PER_FILE,
            "previews_remaining": MAX_PREVIEWS_PER_FILE,
            "previewsRemaining": MAX_PREVIEWS_PER_FILE,
            "refresh_count": 0,
            "max_refreshes": MAX_REFRESHES_PER_SESSION,
            "qr_data": file_id,
            "owner_token": owner_token,
        }

    # ─── Upload (Chunked Pipeline) ──────────────────────────────────────────

    def init_chunked_upload(self, form_data: dict, filename: str = "", content_type: str = "") -> dict:
        """Initialize a multi-chunk upload session."""
        file_count = form_data.get("file_count", 1)
        if file_count > MAX_FILES_PER_TRANSFER:
            raise ValidationError(f"Maximum of {MAX_FILES_PER_TRANSFER} files allowed per transfer (got {file_count})")

        transfer_id = None
        self._check_system_user_capacity(transfer_id)

        original_size = form_data["original_size"]
        client_id = (form_data.get("client_id") or "anonymous").strip()
        self.check_user_quota(client_id, original_size)

        iv = form_data["iv"]
        salt = form_data["salt"]
        original_name = form_data["original_name"]
        original_size = form_data["original_size"]
        compressed = form_data["compressed"]
        max_downloads = form_data["max_downloads"]
        burn_on_read = form_data["burn_on_read"]
        expiry_hours = form_data["expiry_hours"]
        sharing_mode = form_data["sharing_mode"]
        checksum = (form_data.get("checksum") or "").strip()[:64]
        access_hash = form_data["access_hash"]
        wrapped_key = form_data.get("wrapped_key")
        wrap_iv = form_data.get("wrap_iv")

        file_id = form_data.get("file_id") or generate_id()
        transfer_id = form_data.get("transfer_id") or generate_id()
        owner_token = generate_owner_token()
        now_utc = get_utc_now()
        created_at_iso = now_utc.isoformat()
        expires_at = now_utc + timedelta(seconds=form_data["expiry_seconds"])
        expires_at_iso = expires_at.isoformat()
        effective_max_downloads = max_downloads

        conn = self.db.get_connection()
        try:
            conn.execute("""
                INSERT INTO transfers (id, token_hash, client_id, status, created_at, expires_at, total_size, file_count, sharing_mode, refresh_count, max_refreshes, burn_on_read)
                VALUES (?, ?, ?, 'uploading', ?, ?, ?, 1, ?, 0, 5, ?)
                ON CONFLICT(id) DO UPDATE SET total_size = total_size + excluded.total_size, file_count = file_count + 1, client_id = COALESCE(client_id, excluded.client_id)
            """, (transfer_id, hash_token(owner_token), client_id, created_at_iso, expires_at_iso, original_size, sharing_mode, burn_on_read))

            conn.execute("""
                INSERT INTO files (id, transfer_id, client_id, filename, original_name, original_size, encrypted_size,
                                  mime_type, created_at, expires_at, download_count, max_downloads, max_previews, preview_count, iv, salt, compressed, checksum, burn_on_read, status, access_hash, wrapped_key, wrap_iv)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0, ?, ?, 0, ?, ?, ?, ?, ?, 'uploading', ?, ?, ?)
            """, (
                file_id, transfer_id, client_id, filename or "file.encrypted", original_name, original_size,
                content_type or "application/octet-stream", created_at_iso, expires_at_iso,
                effective_max_downloads, MAX_PREVIEWS_PER_FILE, iv, salt, compressed, checksum, burn_on_read, access_hash, wrapped_key, wrap_iv
            ))
            conn.commit()
        finally:
            conn.close()

        downloads_remaining = effective_max_downloads if effective_max_downloads > 0 else None

        return {
            "file_id": file_id,
            "transfer_id": transfer_id,
            "share_url": f"/download/{file_id}",
            "created_at": created_at_iso,
            "createdAt": created_at_iso,
            "expires_at": expires_at_iso,
            "expiresAt": expires_at_iso,
            "download_count": 0,
            "downloadCount": 0,
            "max_downloads": effective_max_downloads,
            "maxDownloads": effective_max_downloads,
            "downloads_remaining": downloads_remaining,
            "downloadsRemaining": downloads_remaining,
            "preview_count": 0,
            "previewCount": 0,
            "max_previews": MAX_PREVIEWS_PER_FILE,
            "maxPreviews": MAX_PREVIEWS_PER_FILE,
            "previews_remaining": MAX_PREVIEWS_PER_FILE,
            "previewsRemaining": MAX_PREVIEWS_PER_FILE,
            "owner_token": owner_token,
            "refresh_count": 0,
            "max_refreshes": MAX_REFRESHES_PER_SESSION,
        }

    def save_chunk(self, transfer_id: str, file_id: str, chunk_index: int, total_chunks: int, chunk_file_obj, checksum: str = "") -> dict:
        """Save a single chunk file to disk and record it in database."""
        chunk_id = f"{file_id}_{chunk_index}"
        chunk_path = self.storage.get_chunk_path(transfer_id, file_id, chunk_index)

        chunk_size = 0
        with open(chunk_path, "wb") as f:
            while chunk_data := chunk_file_obj.read(131072):
                chunk_size += len(chunk_data)
                f.write(chunk_data)

        conn = self.db.get_connection()
        try:
            conn.execute("""
                INSERT OR REPLACE INTO chunks (id, transfer_id, file_id, chunk_index, total_chunks, chunk_size, checksum)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (chunk_id, transfer_id, file_id, chunk_index, total_chunks, chunk_size, checksum))
            conn.commit()
        finally:
            conn.close()

        return {"chunk_index": chunk_index, "chunk_size": chunk_size, "received": True}

    def complete_chunked_upload(self, transfer_id: str, file_id: str, total_chunks: int, owner_token: str = "") -> dict:
        """Assemble received chunks into the final encrypted blob and mark transfer ready."""
        conn = self.db.get_connection()
        try:
            row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
            if not row:
                raise NotFoundError("Transfer not found")

            t_row = conn.execute("SELECT * FROM transfers WHERE id = ?", (transfer_id,)).fetchone()
            if not t_row:
                raise NotFoundError("Transfer session not found")

            if owner_token and not tokens_match(owner_token, t_row["token_hash"] or ""):
                raise ForbiddenError("Invalid owner token")

            file_path = self.storage.get_file_path(file_id)
            total_encrypted_size = 0

            with open(file_path, "wb") as out_f:
                for idx in range(total_chunks):
                    c_path = self.storage.get_chunk_path(transfer_id, file_id, idx)
                    if not os.path.exists(c_path):
                        raise ValidationError(f"Missing chunk {idx} of {total_chunks}")
                    with open(c_path, "rb") as in_f:
                        while piece := in_f.read(262144):
                            total_encrypted_size += len(piece)
                            if total_encrypted_size > MAX_ALLOWED_ENCRYPTED:
                                raise ValueError("Total file size cannot exceed 1 GB")
                            out_f.write(piece)

            # Purge temporary chunks
            self.storage.purge_transfer_chunks(transfer_id)

            conn.execute("UPDATE files SET status = 'ready', encrypted_size = ? WHERE id = ?", (total_encrypted_size, file_id))
            conn.execute("UPDATE transfers SET status = 'active' WHERE id = ?", (transfer_id,))
            conn.execute("DELETE FROM chunks WHERE file_id = ?", (file_id,))
            conn.commit()

            max_d = row["max_downloads"]
            dl_count = row["download_count"] or 0
            downloads_remaining = max(0, max_d - dl_count) if (max_d is not None and max_d > 0) else None

            return {
                "file_id": file_id,
                "transfer_id": transfer_id,
                "share_url": f"/download/{file_id}",
                "created_at": row["created_at"],
                "createdAt": row["created_at"],
                "expires_at": row["expires_at"],
                "expiresAt": row["expires_at"],
                "download_count": dl_count,
                "downloadCount": dl_count,
                "max_downloads": max_d,
                "maxDownloads": max_d,
                "downloads_remaining": downloads_remaining,
                "downloadsRemaining": downloads_remaining,
                "refresh_count": t_row["refresh_count"],
                "max_refreshes": t_row["max_refreshes"],
                "qr_data": file_id,
                "owner_token": owner_token,
            }
        finally:
            conn.close()

    # ─── Token refresh ──────────────────────────────────────────────────────

    def refresh_token(self, transfer_id: str) -> dict:
        """
        Refresh transfer token / QR code. Atomic and race-safe:
        the database enforces the refresh limit inside the UPDATE.
        """
        conn = self.db.get_connection()
        try:
            row = conn.execute("""
                UPDATE transfers
                SET refresh_count = refresh_count + 1
                WHERE id = ? AND refresh_count < max_refreshes
                RETURNING refresh_count, max_refreshes
            """, (transfer_id,)).fetchone()

            if not row:
                # Either the transfer is missing, or the limit was reached.
                existing = conn.execute(
                    "SELECT refresh_count, max_refreshes FROM transfers WHERE id = ?",
                    (transfer_id,)
                ).fetchone()
                if not existing:
                    raise NotFoundError("Transfer session not found")
                raise ConflictError(
                    f"QR refresh limit reached|{existing['refresh_count']}|{existing['max_refreshes']}"
                )

            conn.commit()
            return {
                "transfer_id": transfer_id,
                "refresh_count": row["refresh_count"],
                "max_refreshes": row["max_refreshes"],
                "message": f"Token refreshed ({row['refresh_count']}/{row['max_refreshes']})"
            }
        finally:
            conn.close()

    # ─── File info ──────────────────────────────────────────────────────────

    def _require_access_proof(self, conn, file_id: str, row: dict, proof: str):
        stored = ""
        try:
            stored = row["access_hash"] or ""
        except (IndexError, KeyError):
            stored = ""
        if stored:
            locked_until = row["locked_until"] if "locked_until" in row.keys() else None
            if locked_until and get_utc_now_iso() < locked_until:
                raise NotFoundError("File not found or unauthorized")

            if not proofs_match(proof, stored):
                failed_count = (row["failed_proof_count"] if "failed_proof_count" in row.keys() else 0) + 1
                locked_until_val = None
                if failed_count >= 5:
                    locked_until_val = (get_utc_now() + timedelta(minutes=10)).isoformat()
                
                conn.execute(
                    "UPDATE files SET failed_proof_count = ?, locked_until = ? WHERE id = ?",
                    (failed_count, locked_until_val, file_id)
                )
                conn.commit()
                raise NotFoundError("File not found or unauthorized")
            failed_count_val = row["failed_proof_count"] if "failed_proof_count" in row.keys() else 0
            if failed_count_val > 0:
                conn.execute("UPDATE files SET failed_proof_count = 0, locked_until = NULL WHERE id = ?", (file_id,))
                conn.commit()

    def get_file_info(self, file_id: str, proof: str = "") -> dict:
        """
        Get file metadata (no blob).
        Raises NotFoundError if missing.
        Raises GoneError if expired or burned/max downloads reached.
        """
        conn = self.db.get_connection()
        try:
            row = conn.execute(
                "SELECT * FROM files WHERE id = ?",
                (file_id,)
            ).fetchone()

            if not row:
                # Try transfer lookup (legacy share links point at transfer IDs)
                t_row = conn.execute(
                    "SELECT * FROM transfers WHERE id = ?",
                    (file_id,)
                ).fetchone()
                if t_row:
                    row = conn.execute(
                        "SELECT * FROM files WHERE transfer_id = ? LIMIT 1",
                        (file_id,)
                    ).fetchone()

            if not row:
                raise NotFoundError("File not found or unauthorized")

            if is_expired(row["expires_at"]):
                raise GoneError("This file is no longer available because the sharing time limit has expired.")

            if row["status"] == "burned":
                if bool(row["burn_on_read"]):
                    raise GoneError("This file is no longer available. It was protected with Burn After Read and has self-destructed.")
                else:
                    raise GoneError("The download limit has been reached. This file is no longer available.")

            if bool(row["burn_on_read"]) and row["max_downloads"] > 0 and row["download_count"] >= row["max_downloads"]:
                raise GoneError("This file is no longer available. It was protected with Burn After Read and has self-destructed.")

            if row["max_downloads"] > 0 and row["download_count"] >= row["max_downloads"]:
                raise GoneError("The download limit has been reached. This file is no longer available.")

            self._require_access_proof(conn, row["id"], row, proof)

            downloads_remaining = None
            if row["max_downloads"] > 0:
                downloads_remaining = max(0, row["max_downloads"] - row["download_count"])

            cur_p = int(row["preview_count"] or 0)
            max_p = int(row["max_previews"] or MAX_PREVIEWS_PER_FILE) if ("max_previews" in row.keys() and row["max_previews"] is not None) else MAX_PREVIEWS_PER_FILE
            previews_remaining = max(0, max_p - cur_p)

            return {
                "id": row["id"],
                "transfer_id": row["transfer_id"] or row["id"],
                "original_name": row["original_name"],
                "original_size": row["original_size"],
                "encrypted_size": row["encrypted_size"],
                "mime_type": row["mime_type"],
                "created_at": row["created_at"],
                "createdAt": row["created_at"],
                "expires_at": row["expires_at"],
                "expiresAt": row["expires_at"],
                "download_count": row["download_count"],
                "downloadCount": row["download_count"],
                "max_downloads": row["max_downloads"],
                "maxDownloads": row["max_downloads"],
                "downloads_remaining": downloads_remaining,
                "downloadsRemaining": downloads_remaining,
                "preview_count": cur_p,
                "previewCount": cur_p,
                "max_previews": max_p,
                "maxPreviews": max_p,
                "previews_remaining": previews_remaining,
                "previewsRemaining": previews_remaining,
                "compressed": bool(row["compressed"]),
                "burn_on_read": bool(row["burn_on_read"]),
                "burnOnRead": bool(row["burn_on_read"]),
                "status": row["status"] or "ready",
                "iv": row["iv"],
                "salt": row["salt"],
                "checksum": row["checksum"] or "",
                "wrapped_key": row["wrapped_key"] if "wrapped_key" in row.keys() else "",
                "wrap_iv": row["wrap_iv"] if "wrap_iv" in row.keys() else ""
            }
        finally:
            conn.close()

    # ─── Download ───────────────────────────────────────────────────────────

    def download_file(self, file_id: str, preview: bool = False, proof: str = ""):
        """
        Prepare file for download stream. Verifies availability and access proof.
        Returns (row_dict, file_path, is_burn).
        """
        conn = self.db.get_connection()
        try:
            row = conn.execute(
                "SELECT * FROM files WHERE id = ?",
                (file_id,)
            ).fetchone()

            if not row:
                raise NotFoundError("File not found or unauthorized")

            if is_expired(row["expires_at"]):
                raise GoneError("This file is no longer available because the sharing time limit has expired.")

            if row["status"] == "burned":
                if bool(row["burn_on_read"]):
                    raise GoneError("This file is no longer available. It was protected with Burn After Read and has self-destructed.")
                else:
                    raise GoneError("The download limit has been reached. This file is no longer available.")

            if bool(row["burn_on_read"]) and row["max_downloads"] > 0 and row["download_count"] >= row["max_downloads"]:
                raise GoneError("This file is no longer available. It was protected with Burn After Read and has self-destructed.")

            if row["max_downloads"] > 0 and row["download_count"] >= row["max_downloads"]:
                raise GoneError("The download limit has been reached. This file is no longer available.")

            self._require_access_proof(conn, row["id"], row, proof)

            if preview:
                cur_previews = int(row["preview_count"] or 0)
                max_prev = int(row["max_previews"] or MAX_PREVIEWS_PER_FILE) if ("max_previews" in row.keys() and row["max_previews"] is not None) else MAX_PREVIEWS_PER_FILE
                if cur_previews >= max_prev:
                    raise GoneError(f"Preview limit reached (maximum {max_prev} previews used). Please proceed to Step 2: Save & Download.")

                conn.execute("""
                    UPDATE files
                    SET preview_count = COALESCE(preview_count, 0) + 1
                    WHERE id = ?
                """, (file_id,))
                conn.commit()
                is_burn = False
            else:
                next_count = row["download_count"] + 1
                is_burn = (
                    (bool(row["burn_on_read"]) and (row["max_downloads"] == 0 or next_count >= row["max_downloads"]))
                    or (row["max_downloads"] > 0 and next_count >= row["max_downloads"])
                )
                
                # Atomic reservation for burn-on-read
                if bool(row["burn_on_read"]) and (row["max_downloads"] <= 1 or next_count >= row["max_downloads"]):
                    timeout_iso = (get_utc_now() - timedelta(minutes=5)).isoformat()
                    updated = conn.execute("""
                        UPDATE files
                        SET reserved_at = ?, status = 'reserved'
                        WHERE id = ? AND (status = 'ready' OR (status = 'reserved' AND reserved_at < ?))
                        RETURNING id
                    """, (get_utc_now_iso(), file_id, timeout_iso)).fetchone()
                    
                    if not updated:
                        raise GoneError("This file is currently being downloaded or has already been burned.")
                    conn.commit()
        finally:
            conn.close()

        file_path = self.storage.get_file_path(file_id)
        if not os.path.exists(file_path):
            raise NotFoundError("File data missing")

        cur_p = (row["preview_count"] or 0) + (1 if preview else 0)
        max_p = int(row["max_previews"] or MAX_PREVIEWS_PER_FILE) if ("max_previews" in row.keys() and row["max_previews"] is not None) else MAX_PREVIEWS_PER_FILE
        row_dict = {
            "id": row["id"],
            "filename": row["filename"],
            "original_name": row["original_name"],
            "encrypted_size": row["encrypted_size"],
            "compressed": row["compressed"],
            "burn_on_read": row["burn_on_read"],
            "max_downloads": row["max_downloads"],
            "download_count": row["download_count"],
            "downloads_remaining": max(0, row["max_downloads"] - row["download_count"]) if row["max_downloads"] > 0 else None,
            "preview_count": cur_p,
            "max_previews": max_p,
            "previews_remaining": max(0, max_p - cur_p),
            "iv": row["iv"],
            "salt": row["salt"],
            "checksum": row["checksum"] or "",
            "wrapped_key": row["wrapped_key"] if "wrapped_key" in row.keys() else "",
            "wrap_iv": row["wrap_iv"] if "wrap_iv" in row.keys() else ""
        }

        return row_dict, file_path, is_burn

    def record_successful_download(self, file_id: str) -> bool:
        """
        Atomically records a completed, successful download.
        Purges file ciphertext if max_downloads or burn_on_read threshold is reached,
        while maintaining the status record in SQLite so subsequent requests return precise 410 messages.
        Returns True if burned/purged, False otherwise.
        """
        conn = self.db.get_connection()
        should_purge = False
        try:
            row = conn.execute(
                "SELECT download_count, max_downloads, burn_on_read FROM files WHERE id = ?",
                (file_id,)
            ).fetchone()
            if not row:
                return False

            updated = conn.execute("""
                UPDATE files
                SET download_count = download_count + 1
                WHERE id = ?
                RETURNING download_count, max_downloads, burn_on_read
            """, (file_id,)).fetchone()

            if updated:
                new_count = updated["download_count"]
                max_d = updated["max_downloads"]
                burn = bool(updated["burn_on_read"])
                if (burn and (max_d == 0 or new_count >= max_d)) or (max_d > 0 and new_count >= max_d):
                    should_purge = True
                    conn.execute("UPDATE files SET status = 'burned' WHERE id = ?", (file_id,))
            conn.commit()
        except Exception:
            pass
        finally:
            conn.close()

        if should_purge:
            self.storage.delete_file(file_id)
        return should_purge

    # ─── Purge / delete ─────────────────────────────────────────────────────

    def purge_file(self, file_id: str):
        """
        Zero-Knowledge Complete Data Purging: deletes physical blob AND database records.
        Safe to call even if the file is already gone.
        """
        self.storage.delete_file(file_id)
        conn = self.db.get_connection()
        try:
            conn.execute("DELETE FROM files WHERE id = ?", (file_id,))
            conn.execute("DELETE FROM chunks WHERE file_id = ?", (file_id,))
            conn.commit()
        except Exception as e:
            import logging
            logging.getLogger(__name__).exception("purge_file DB cleanup failed for %s: %s", file_id, e)
        finally:
            conn.close()

    def delete_file(self, file_id: str, owner_token: str):
        """Delete a file when the sender presents the owner token from upload."""
        if not owner_token:
            raise ForbiddenError("Owner token required")

        conn = self.db.get_connection()
        try:
            row = conn.execute("SELECT id, transfer_id FROM files WHERE id = ?", (file_id,)).fetchone()
            if not row:
                raise NotFoundError("File not found")

            t_row = conn.execute("SELECT token_hash FROM transfers WHERE id = ?", (row["transfer_id"],)).fetchone()
            if not t_row or not tokens_match(owner_token, t_row["token_hash"]):
                raise ForbiddenError("Invalid owner token")

            conn.execute("DELETE FROM files WHERE id = ?", (file_id,))
            conn.execute("DELETE FROM chunks WHERE file_id = ?", (file_id,))
            conn.commit()
        finally:
            conn.close()
        self.storage.delete_file(file_id)

    # ─── Stats ──────────────────────────────────────────────────────────────

    def get_stats(self) -> dict:
        """Public limits and system storage stats."""
        total_used = self._get_total_storage_used()
        return {
            "max_file_size": MAX_FILE_SIZE,
            "per_user_max_storage": PER_USER_MAX_STORAGE,
            "max_system_storage": MAX_SYSTEM_STORAGE,
            "total_storage_used": total_used,
            "max_refreshes": MAX_REFRESHES_PER_SESSION,
            "max_previews": MAX_PREVIEWS_PER_FILE,
            "default_max_downloads": DEFAULT_MAX_DOWNLOADS,
            "server_time": get_utc_now().isoformat()
        }

    def get_db_metrics(self) -> dict:
        """Database performance, sizing, and storage telemetry."""
        return self.db.get_db_metrics()

