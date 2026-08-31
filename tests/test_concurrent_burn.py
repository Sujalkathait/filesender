import os
import threading
import pytest
from api.services.transfer_service import TransferService
from api.database import DatabaseManager
from api.storage import StorageManager
from api.errors import NotFoundError

@pytest.fixture
def db_path(tmp_path):
    return str(tmp_path / "test_concurrent.db")

@pytest.fixture
def storage_dir(tmp_path):
    return str(tmp_path / "uploads_concurrent")

@pytest.fixture
def service(db_path, storage_dir):
    os.environ["DB_PATH"] = db_path
    os.environ["UPLOAD_DIR"] = storage_dir
    db = DatabaseManager(db_path)
    storage = StorageManager(storage_dir)
    return TransferService(db, storage)

def test_concurrent_burn_on_read(service, db_path):
    form_data = {
        "filename": "test.txt.encrypted",
        "original_name": "test.txt",
        "original_size": 100,
        "iv": "fake_iv",
        "salt": "fake_salt",
        "wrapped_key": "fake_wrapped_key",
        "wrap_iv": "fake_wrap_iv",
        "compressed": 1,
        "max_downloads": 1,
        "burn_on_read": 1,
        "expiry_seconds": 3600,
        "expiry_hours": 1.0,
        "sharing_mode": "burn_on_read",
        "access_hash": "hash123"
    }
    
    res = service.init_chunked_upload(form_data, form_data["filename"], "application/octet-stream")
    file_id = res["file_id"]
    
    # Create empty mock file blob on disk
    file_path = os.path.join(os.environ["UPLOAD_DIR"], file_id)
    with open(file_path, "wb") as f:
        f.write(b"mock")
    
    db = DatabaseManager(db_path)
    conn = db.get_connection()
    conn.execute("UPDATE files SET status = 'ready' WHERE id = ?", (file_id,))
    conn.commit()
    conn.close()

    results = []
    
    def download_attempt():
        try:
            # Re-initialize DB/Storage within the thread to simulate concurrent requests
            thread_db = DatabaseManager(os.environ.get("DB_PATH", db_path))
            thread_storage = StorageManager(os.environ.get("UPLOAD_DIR", "uploads"))
            thread_service = TransferService(thread_db, thread_storage)
            thread_service.download_file(file_id, preview=False, proof="hash123")
            results.append("success")
        except NotFoundError:
            results.append("not_found")
        except Exception as e:
            results.append(str(e))
            
    threads = [threading.Thread(target=download_attempt) for _ in range(5)]
    
    for t in threads:
        t.start()
        
    for t in threads:
        t.join()

    print(f"Results: {results}")

    # Exactly ONE success, everything else should be locked
    success_count = sum(1 for r in results if r == "success")
    locked_count = sum(1 for r in results if "currently being downloaded" in r)

    assert success_count == 1
    assert locked_count == 4
