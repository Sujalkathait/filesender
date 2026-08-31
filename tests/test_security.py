import os
import pytest
from api.services.transfer_service import TransferService
from api.database import DatabaseManager
from api.storage import StorageManager
from api.errors import NotFoundError, PayloadTooLargeError

@pytest.fixture
def db_path(tmp_path):
    return str(tmp_path / "test_sec.db")

@pytest.fixture
def storage_dir(tmp_path):
    return str(tmp_path / "uploads_sec")

@pytest.fixture
def service(db_path, storage_dir):
    os.environ["DB_PATH"] = db_path
    os.environ["UPLOAD_DIR"] = storage_dir
    db = DatabaseManager()
    storage = StorageManager()
    return TransferService(db, storage)

def test_file_metadata_does_not_leak_sensitive_info(service, db_path):
    form_data = {
        "filename": "test.txt.encrypted",
        "original_name": "test.txt",
        "original_size": 100,
        "iv": "fake_iv",
        "salt": "fake_salt",
        "wrapped_key": "fake_wrapped_key",
        "wrap_iv": "fake_wrap_iv",
        "compressed": "1",
        "max_downloads": "5",
        "burn_on_read": "0",
        "expiry_seconds": "3600",
        "sharing_mode": "standard",
        "access_hash": "hash123"
    }
    
    res = service.init_chunked_upload(form_data, form_data["filename"], "application/octet-stream")
    file_id = res["file_id"]
    
    # Ready the file
    db = DatabaseManager()
    conn = db.get_connection()
    conn.execute("UPDATE files SET status = 'ready' WHERE id = ?", (file_id,))
    conn.commit()
    conn.close()
    
    info = service.get_file_info(file_id, proof="hash123")
    
    # Validate sensitive fields are missing
    assert "wrapped_key" not in info
    assert "wrap_iv" not in info
    assert "access_hash" not in info
    
    assert info["id"] == file_id
    assert info["original_name"] == "test.txt"

def test_generic_error_for_invalid_file(service):
    with pytest.raises(NotFoundError) as exc:
        service.get_file_info("invalid_id", proof="hash123")
        
    assert "File not found or unauthorized" in str(exc.value)

def test_generic_error_for_invalid_proof(service, db_path):
    form_data = {
        "filename": "test.txt.encrypted",
        "original_name": "test.txt",
        "original_size": 100,
        "iv": "fake_iv",
        "salt": "fake_salt",
        "wrapped_key": "fake_wrapped_key",
        "wrap_iv": "fake_wrap_iv",
        "compressed": "1",
        "max_downloads": "5",
        "burn_on_read": "0",
        "expiry_seconds": "3600",
        "sharing_mode": "standard",
        "access_hash": "hash123"
    }
    
    res = service.init_chunked_upload(form_data, form_data["filename"], "application/octet-stream")
    file_id = res["file_id"]
    
    # Ready the file
    db = DatabaseManager()
    conn = db.get_connection()
    conn.execute("UPDATE files SET status = 'ready' WHERE id = ?", (file_id,))
    conn.commit()
    conn.close()
    
    with pytest.raises(NotFoundError) as exc:
        service.get_file_info(file_id, proof="wrong")
        
    assert "File not found or unauthorized" in str(exc.value)
