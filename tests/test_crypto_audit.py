import os
import sqlite3
import pytest
from datetime import datetime, timedelta
from api.services.transfer_service import TransferService
from api.database import DatabaseManager
from api.storage import StorageManager
from api.errors import ForbiddenError, NotFoundError, GoneError

@pytest.fixture
def db_path(tmp_path):
    return str(tmp_path / "test.db")

@pytest.fixture
def storage_dir(tmp_path):
    return str(tmp_path / "uploads")

@pytest.fixture
def service(db_path, storage_dir):
    os.environ["DB_PATH"] = db_path
    os.environ["UPLOAD_DIR"] = storage_dir
    db = DatabaseManager(db_path)
    storage = StorageManager(storage_dir)
    return TransferService(db, storage)

def test_wrapped_key_and_iv_saved(service, db_path):
    # Simulate an upload init with wrapped key and iv
    form_data = {
        "filename": "test.txt.encrypted",
        "original_name": "test.txt",
        "original_size": 100,
        "iv": "fake_iv",
        "salt": "fake_salt",
        "wrapped_key": "fake_wrapped_key",
        "wrap_iv": "fake_wrap_iv",
        "compressed": "1",
        "max_downloads": 5,
        "burn_on_read": "0",
        "expiry_seconds": 3600,
        "sharing_mode": "standard",
        "access_hash": "hash123",
        "expiry_hours": 1.0
    }
    
    res = service.init_chunked_upload(form_data, form_data["filename"], "application/octet-stream")
    file_id = res["file_id"]
    
    # Check database
    db = DatabaseManager(db_path)
    conn = db.get_connection()
    row = conn.execute("SELECT wrapped_key, wrap_iv FROM files WHERE id = ?", (file_id,)).fetchone()
    conn.close()
    
    assert row is not None
    assert row["wrapped_key"] == "fake_wrapped_key"
    assert row["wrap_iv"] == "fake_wrap_iv"

def test_burn_on_read_race_condition(service, db_path):
    # Create a burn on read file
    form_data = {
        "filename": "test.txt.encrypted",
        "original_name": "test.txt",
        "original_size": 100,
        "iv": "fake_iv",
        "salt": "fake_salt",
        "wrapped_key": "fake_wrapped_key",
        "wrap_iv": "fake_wrap_iv",
        "compressed": "1",
        "max_downloads": 1,
        "burn_on_read": "1",
        "expiry_seconds": 3600,
        "sharing_mode": "burn_on_read",
        "access_hash": "hash123",
        "expiry_hours": 1.0
    }
    
    res = service.init_chunked_upload(form_data, form_data["filename"], "application/octet-stream")
    file_id = res["file_id"]
    
    # Emulate the chunks being completed
    # Actually just set the status to ready in DB since we just want to test download
    db = DatabaseManager(db_path)
    conn = db.get_connection()
    conn.execute("UPDATE files SET status = 'ready' WHERE id = ?", (file_id,))
    conn.commit()

    import os
    os.makedirs(os.path.dirname(service.storage.get_file_path(file_id)), exist_ok=True)
    with open(service.storage.get_file_path(file_id), 'wb') as f: f.write(b'dummy')

    
    # First download attempt should succeed and reserve the file
    service.download_file(file_id, preview=False, proof="hash123")
    
    # Second download attempt should immediately fail with NotFoundError because it's reserved
    with pytest.raises(GoneError):
        service.download_file(file_id, preview=False, proof="hash123")
    
    conn.close()

def test_failed_access_lockout(service, db_path):
    # Create a file
    form_data = {
        "filename": "test.txt.encrypted",
        "original_name": "test.txt",
        "original_size": 100,
        "iv": "fake_iv",
        "salt": "fake_salt",
        "wrapped_key": "fake_wrapped_key",
        "wrap_iv": "fake_wrap_iv",
        "compressed": "1",
        "max_downloads": 5,
        "burn_on_read": "0",
        "expiry_seconds": 3600,
        "sharing_mode": "standard",
        "access_hash": "hash123",
        "expiry_hours": 1.0
    }
    
    res = service.init_chunked_upload(form_data, form_data["filename"], "application/octet-stream")
    file_id = res["file_id"]
    
    db = DatabaseManager(db_path)
    conn = db.get_connection()
    conn.execute("UPDATE files SET status = 'ready' WHERE id = ?", (file_id,))
    conn.commit()

    import os
    os.makedirs(os.path.dirname(service.storage.get_file_path(file_id)), exist_ok=True)
    with open(service.storage.get_file_path(file_id), 'wb') as f: f.write(b'dummy')

    
    # 5 wrong attempts
    for _ in range(5):
        with pytest.raises(NotFoundError):
            service.get_file_info(file_id, proof="wrong")
            
    # 6th attempt (even if correct) should fail with lockout
    with pytest.raises(NotFoundError):
        service.get_file_info(file_id, proof="hash123")
        
    conn.close()
