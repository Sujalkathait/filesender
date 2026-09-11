"""
FileShare Cleanup Service
Background task that purges expired files, transfers, and orphaned disk blobs.

Performance notes:
- Expired rows are collected and deleted with batched queries
  (DELETE ... WHERE expires_at < ?) instead of one DELETE per row.
- File blobs are deleted only for rows that actually expired.
- The orphan disk scan includes an mtime grace period (300s) to avoid deleting in-flight uploads.
"""

import os
import time
from api.config import ORPHAN_GRACE_PERIOD_SECONDS
from api.database import DatabaseManager
from api.storage import StorageManager
from api.utils import get_utc_now_iso, is_expired


class CleanupService:
    """Periodic background cleanup: purges expired records and orphaned files."""

    def __init__(self, db_manager: DatabaseManager, storage_manager: StorageManager):
        self.db = db_manager
        self.storage = storage_manager

    def run(self):
        """Execute one cleanup pass: expired files, expired transfers, orphan blobs."""
        conn = None
        try:
            conn = self.db.get_connection()
            now_iso = get_utc_now_iso()

            from datetime import timedelta
            from api.utils import get_utc_now, parse_iso_datetime
            now_utc = get_utc_now()

            # 1. Expired files: collect IDs (either by expires_at or 24-hour daily TTL limit)
            cursor = conn.execute("SELECT id, expires_at, created_at FROM files")
            expired_ids = set()
            for row in cursor.fetchall():
                if is_expired(row["expires_at"]):
                    expired_ids.add(row["id"])
                elif row["created_at"]:
                    try:
                        c_dt = parse_iso_datetime(row["created_at"])
                        if c_dt and (now_utc - c_dt).total_seconds() >= 86400:
                            expired_ids.add(row["id"])
                    except Exception:
                        pass

            expired_id_list = list(expired_ids)
            for file_id in expired_id_list:
                self.storage.delete_file(file_id)

            if expired_id_list:
                placeholders = ",".join("?" for _ in expired_id_list)
                conn.execute(f"DELETE FROM files WHERE id IN ({placeholders})", expired_id_list)
                conn.execute(f"DELETE FROM chunks WHERE file_id IN ({placeholders})", expired_id_list)
                
            # 1.5. Release stale reservations
            timeout_iso = (now_utc - timedelta(minutes=5)).isoformat()
            conn.execute("UPDATE files SET status = 'ready', reserved_at = NULL WHERE status = 'reserved' AND reserved_at < ?", (timeout_iso,))

            # 2. Expired transfers: purge their chunk dirs, then bulk-delete rows
            t_cursor = conn.execute("SELECT id, expires_at, created_at FROM transfers")
            expired_transfer_ids = set()
            for row in t_cursor.fetchall():
                if is_expired(row["expires_at"]):
                    expired_transfer_ids.add(row["id"])
                elif row["created_at"]:
                    try:
                        c_dt = parse_iso_datetime(row["created_at"])
                        if c_dt and (now_utc - c_dt).total_seconds() >= 86400:
                            expired_transfer_ids.add(row["id"])
                    except Exception:
                        pass

            expired_t_list = list(expired_transfer_ids)
            for transfer_id in expired_t_list:
                self.storage.purge_transfer_chunks(transfer_id)

            if expired_t_list:
                placeholders = ",".join("?" for _ in expired_t_list)
                conn.execute(f"DELETE FROM transfers WHERE id IN ({placeholders})", expired_t_list)
                conn.execute(f"DELETE FROM chunks WHERE transfer_id IN ({placeholders})", expired_t_list)

            conn.commit()

            # 3. Orphan blob scan: delete any file on disk with no DB row,
            # respecting a grace period to avoid race conditions with in-flight uploads.
            active_cursor = conn.execute("SELECT id FROM files")
            active_ids = {row["id"] for row in active_cursor.fetchall()}
            current_time = time.time()

            for filename in self.storage.list_upload_files():
                if filename not in active_ids:
                    fpath = self.storage.get_file_path(filename)
                    try:
                        # Only purge if file was created/modified more than grace period ago
                        file_mtime = os.path.getmtime(fpath)
                        if (current_time - file_mtime) > ORPHAN_GRACE_PERIOD_SECONDS:
                            self.storage.delete_file(filename)
                    except OSError:
                        pass

        except Exception as e:
            import logging
            logging.getLogger(__name__).exception("Cleanup pass failed: %s", e)
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
