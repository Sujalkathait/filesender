"""
Test suite for:
1. Per-User 1 GB Storage Quota (isolation between users)
2. Manual "Clear My Storage" endpoint and quota reset
3. Step 1 (Preview max 2 views) vs Step 2 (Download max 2 saves) separation
4. 24-Hour automatic storage wipe
"""

import io
import os
import sys
import hashlib
import tempfile
from datetime import timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test_user_quota.db")
os.environ["UPLOAD_DIR"] = os.path.join(tempfile.mkdtemp(), "uploads_user_quota")

from api.index import app
from api.storage import StorageManager
from api.config import UPLOAD_DIR, PER_USER_MAX_STORAGE
from api.utils import get_utc_now
from api.services.cleanup_service import CleanupService

TEST_KEY = "aabb112233"
PROOF = hashlib.sha256(f"fileshare-access:{TEST_KEY}".encode("utf-8")).hexdigest()


class ClientWithProof:
    def __init__(self, inner):
        self._c = inner

    def post(self, *args, **kwargs):
        headers = dict(kwargs.get("headers") or {})
        kwargs["headers"] = headers
        return self._c.post(*args, **kwargs)

    def get(self, path, *args, **kwargs):
        headers = dict(kwargs.get("headers") or {})
        if "X-Access-Proof" not in headers:
            headers["X-Access-Proof"] = PROOF
        kwargs["headers"] = headers
        return self._c.get(path, *args, **kwargs)

    def delete(self, *args, **kwargs):
        return self._c.delete(*args, **kwargs)


def test_per_user_storage_quota_isolation():
    """Verify User A and User B have independent quotas and User A cannot exceed 1 GB."""
    client = ClientWithProof(app.test_client())
    user_a = "usr_alice_123"
    user_b = "usr_bob_456"

    # User A uploads a 700 MB file
    r1 = client.post("/api/v1/files", data={
        "file": (io.BytesIO(b"alice-file-1"), "alice.bin.encrypted"),
        "iv": "11" * 12,
        "salt": "22" * 16,
        "original_name": "alice.bin",
        "original_size": str(700 * 1024 * 1024),
        "burn_on_read": "0",
        "access_hash": PROOF,
    }, headers={"X-Client-ID": user_a}, content_type="multipart/form-data")
    assert r1.status_code == 200

    # User B can also upload a 700 MB file (would fail under old 1 GB global limit)
    r2 = client.post("/api/v1/files", data={
        "file": (io.BytesIO(b"bob-file-1"), "bob.bin.encrypted"),
        "iv": "33" * 12,
        "salt": "44" * 16,
        "original_name": "bob.bin",
        "original_size": str(700 * 1024 * 1024),
        "burn_on_read": "0",
        "access_hash": PROOF,
    }, headers={"X-Client-ID": user_b}, content_type="multipart/form-data")
    assert r2.status_code == 200

    # User A tries to upload another 400 MB file (700 + 400 = 1100 MB > 1024 MB) -> must be rejected with 413
    r3 = client.post("/api/v1/files", data={
        "file": (io.BytesIO(b"alice-file-2"), "alice2.bin.encrypted"),
        "iv": "55" * 12,
        "salt": "66" * 16,
        "original_name": "alice2.bin",
        "original_size": str(400 * 1024 * 1024),
        "burn_on_read": "0",
        "access_hash": PROOF,
    }, headers={"X-Client-ID": user_a}, content_type="multipart/form-data")
    assert r3.status_code == 413
    assert "personal storage limit exceeded" in r3.get_json()["detail"].lower()


def test_user_storage_status_and_manual_clear():
    """Verify GET /api/v1/user/storage and DELETE /api/v1/user/storage wipe personal files."""
    client = ClientWithProof(app.test_client())
    user_id = "usr_charlie_789"

    # Check initial empty storage
    res0 = client.get("/api/v1/user/storage", headers={"X-Client-ID": user_id})
    assert res0.status_code == 200
    st0 = res0.get_json()
    assert st0["used_bytes"] == 0
    assert st0["used_mb"] == 0
    assert st0["file_count"] == 0

    # Upload 2 files for Charlie
    r1 = client.post("/api/v1/files", data={
        "file": (io.BytesIO(b"doc1-bytes"), "doc1.encrypted"),
        "iv": "12" * 12,
        "salt": "34" * 16,
        "original_name": "doc1.pdf",
        "original_size": str(150 * 1024 * 1024),
        "burn_on_read": "0",
        "access_hash": PROOF,
    }, headers={"X-Client-ID": user_id}, content_type="multipart/form-data")
    assert r1.status_code == 200
    fid1 = r1.get_json()["file_id"]

    r2 = client.post("/api/v1/files", data={
        "file": (io.BytesIO(b"doc2-bytes"), "doc2.encrypted"),
        "iv": "56" * 12,
        "salt": "78" * 16,
        "original_name": "doc2.pdf",
        "original_size": str(250 * 1024 * 1024),
        "burn_on_read": "0",
        "access_hash": PROOF,
    }, headers={"X-Client-ID": user_id}, content_type="multipart/form-data")
    assert r2.status_code == 200

    # Verify storage reports 400 MB and 2 files
    res1 = client.get("/api/v1/user/storage", headers={"X-Client-ID": user_id})
    assert res1.status_code == 200
    st1 = res1.get_json()
    assert st1["used_mb"] == 400
    assert st1["file_count"] == 2

    # Clear My Storage
    del_res = client.delete("/api/v1/user/storage", headers={"X-Client-ID": user_id})
    assert del_res.status_code == 200
    del_data = del_res.get_json()
    assert del_data["deleted_files_count"] == 2
    assert del_data["used_bytes"] == 0

    # Verify storage is now 0 MB
    res2 = client.get("/api/v1/user/storage", headers={"X-Client-ID": user_id})
    st2 = res2.get_json()
    assert st2["used_bytes"] == 0
    assert st2["file_count"] == 0

    # Verify old file is gone
    down = client.get(f"/api/v1/files/{fid1}/content")
    assert down.status_code == 404


def test_preview_max_2_views_and_download_max_2_saves():
    """Verify Step 1 (Preview max 2 views) and Step 2 (Download max 2 saves)."""
    client = ClientWithProof(app.test_client())
    storage_mgr = StorageManager(UPLOAD_DIR)

    # Upload file with max 2 downloads
    r = client.post("/api/v1/files", data={
        "file": (io.BytesIO(b"two-step-content"), "twostep.encrypted"),
        "iv": "ab" * 12,
        "salt": "cd" * 16,
        "original_name": "twostep.png",
        "original_size": "16",
        "max_downloads": "2",
        "burn_on_read": "1",
        "access_hash": PROOF,
    }, content_type="multipart/form-data")
    assert r.status_code == 200
    fid = r.get_json()["file_id"]

    # --- Step 1: Preview (Max 2 Views) ---
    # Preview 1
    p1 = client.get(f"/api/v1/files/{fid}/content?preview=true")
    assert p1.status_code == 200
    assert p1.data == b"two-step-content"
    assert p1.headers.get("X-Preview-Count") == "1"
    assert p1.headers.get("X-Previews-Remaining") == "1"
    assert storage_mgr.file_exists(fid)

    # Preview 2
    p2 = client.get(f"/api/v1/files/{fid}/content?preview=1")
    assert p2.status_code == 200
    assert p2.data == b"two-step-content"
    assert p2.headers.get("X-Preview-Count") == "2"
    assert p2.headers.get("X-Previews-Remaining") == "0"
    assert storage_mgr.file_exists(fid)

    # Preview 3: must be rejected with 410 Gone (Preview limit reached)
    p3 = client.get(f"/api/v1/files/{fid}/content?preview=true")
    assert p3.status_code == 410
    assert "preview limit reached" in p3.get_json()["detail"].lower()
    # File is still preserved on disk for download!
    assert storage_mgr.file_exists(fid)

    # --- Step 2: Download (Max 2 Saves) ---
    # Download 1 (1st Save)
    d1 = client.get(f"/api/v1/files/{fid}/content")
    assert d1.status_code == 200
    assert d1.data == b"two-step-content"
    assert d1.headers.get("X-Download-Count") == "0"  # before completion increment
    assert storage_mgr.file_exists(fid)

    # Check file info shows 1 download used, 1 save remaining
    info = client.get(f"/api/v1/files/{fid}").get_json()
    assert info["download_count"] == 1
    assert info["downloads_remaining"] == 1

    # Download 2 (2nd Save - reaching threshold)
    d2 = client.get(f"/api/v1/files/{fid}/content")
    assert d2.status_code == 200
    assert d2.data == b"two-step-content"

    # After 2nd download, file must be permanently burned/deleted
    assert not storage_mgr.file_exists(fid)

    # Download 3: must be rejected with 410 Gone
    d3 = client.get(f"/api/v1/files/{fid}/content")
    assert d3.status_code == 410
    assert "limit has been reached" in d3.get_json()["detail"].lower() or "self-destructed" in d3.get_json()["detail"].lower()


def test_24_hour_storage_daily_purge():
    """Verify CleanupService purges files created more than 24 hours ago."""
    from api.database import DatabaseManager
    from api.config import DB_PATH
    db = DatabaseManager(DB_PATH)
    storage_mgr = StorageManager(UPLOAD_DIR)

    fid_old = "old24h001"
    fpath = storage_mgr.get_file_path(fid_old)
    with open(fpath, "wb") as f:
        f.write(b"twenty-four-hours-old")

    old_created = (get_utc_now() - timedelta(hours=25)).isoformat()
    # Even if expires_at is set to future, 24h cap should purge it
    future_expires = (get_utc_now() + timedelta(hours=10)).isoformat()

    conn = db.get_connection()
    conn.execute("""
        INSERT OR REPLACE INTO files (id, transfer_id, filename, original_name, original_size, encrypted_size,
                           mime_type, created_at, expires_at, download_count, max_downloads, iv, salt, compressed, burn_on_read, status, access_hash)
        VALUES (?, ?, 'old.encrypted', 'old.txt', 21, 21, 'text/plain', ?, ?, 0, 2, 'aa'*12, 'bb'*16, 1, 0, 'ready', ?)
    """, (fid_old, fid_old, old_created, future_expires, PROOF))
    conn.commit()
    conn.close()

    assert storage_mgr.file_exists(fid_old)

    cleaner = CleanupService(db, storage_mgr)
    cleaner.run()

    # Must be deleted from disk and database
    assert not storage_mgr.file_exists(fid_old)
    c_check = db.get_connection()
    row = c_check.execute("SELECT id FROM files WHERE id = ?", (fid_old,)).fetchone()
    assert row is None
    c_check.close()
