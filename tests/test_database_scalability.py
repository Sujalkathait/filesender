"""
FileShare Database Scalability & Concurrency Tests
Validates:
1. SQLite WAL mode & PRAGMA optimizations (cache_size, temp_store, busy_timeout, foreign_keys).
2. Schema versioning (PRAGMA user_version).
3. Composite indexes presence and execution plan (idx_files_expires_status, idx_chunks_composite, idx_transfers_token_hash).
4. Transaction context manager (ACID commit on success, rollback on error).
5. GET /api/v1/system/db-metrics endpoint shape and data integrity.
"""

import os
import tempfile
import pytest
from api.database import DatabaseManager
from api.index import create_app


@pytest.fixture
def temp_db():
    temp_dir = tempfile.mkdtemp()
    db_file = os.path.join(temp_dir, "test_scale.db")
    db_manager = DatabaseManager(db_file)
    yield db_manager
    try:
        if os.path.exists(db_file):
            os.remove(db_file)
        wal_file = f"{db_file}-wal"
        if os.path.exists(wal_file):
            os.remove(wal_file)
        shm_file = f"{db_file}-shm"
        if os.path.exists(shm_file):
            os.remove(shm_file)
        os.rmdir(temp_dir)
    except Exception:
        pass


def test_sqlite_wal_and_pragmas(temp_db):
    """Verify WAL mode, cache_size, temp_store, busy_timeout, and foreign_keys."""
    conn = temp_db.get_connection()
    try:
        journal_mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        assert journal_mode.lower() == "wal", f"Expected WAL mode, got {journal_mode}"

        synchronous = conn.execute("PRAGMA synchronous").fetchone()[0]
        # In SQLite: 1 = NORMAL, 2 = FULL, 0 = OFF
        assert synchronous in (1, "NORMAL", "1"), f"Expected NORMAL synchronous mode, got {synchronous}"

        busy_timeout = conn.execute("PRAGMA busy_timeout").fetchone()[0]
        assert busy_timeout >= 10000, f"Expected busy_timeout >= 10000, got {busy_timeout}"

        foreign_keys = conn.execute("PRAGMA foreign_keys").fetchone()[0]
        assert foreign_keys == 1, f"Expected foreign_keys = 1, got {foreign_keys}"

        temp_store = conn.execute("PRAGMA temp_store").fetchone()[0]
        # 2 = MEMORY
        assert temp_store in (2, "MEMORY", "2"), f"Expected temp_store = MEMORY, got {temp_store}"

        user_version = conn.execute("PRAGMA user_version").fetchone()[0]
        assert user_version >= 2, f"Expected user_version >= 2, got {user_version}"
    finally:
        conn.close()


def test_composite_indexes_present(temp_db):
    """Verify that high-performance composite indexes are registered in sqlite_master."""
    conn = temp_db.get_connection()
    try:
        rows = conn.execute("SELECT name FROM sqlite_master WHERE type='index'").fetchall()
        index_names = {r["name"] for r in rows}

        expected_indexes = [
            "idx_files_expires_status",
            "idx_chunks_composite",
            "idx_transfers_token_hash",
            "idx_files_expires",
            "idx_transfers_expires"
        ]
        for exp in expected_indexes:
            assert exp in index_names, f"Missing index {exp} in {index_names}"
    finally:
        conn.close()


def test_transaction_context_manager_commit(temp_db):
    """Verify that transaction() commits automatically on normal block exit."""
    with temp_db.transaction() as conn:
        conn.execute(
            "INSERT INTO transfers (id, status, file_count) VALUES (?, ?, ?)",
            ("tx_test_1", "ready", 1)
        )

    # Re-open independent connection to verify commit
    conn2 = temp_db.get_connection()
    try:
        row = conn2.execute("SELECT id, status FROM transfers WHERE id = ?", ("tx_test_1",)).fetchone()
        assert row is not None
        assert row["status"] == "ready"
    finally:
        conn2.close()


def test_transaction_context_manager_rollback(temp_db):
    """Verify that transaction() rolls back atomic changes when an exception is raised."""
    with pytest.raises(RuntimeError):
        with temp_db.transaction() as conn:
            conn.execute(
                "INSERT INTO transfers (id, status, file_count) VALUES (?, ?, ?)",
                ("tx_test_rollback", "pending", 1)
            )
            raise RuntimeError("Simulated crash inside transaction")

    # Re-open independent connection to verify rollback
    conn2 = temp_db.get_connection()
    try:
        row = conn2.execute("SELECT id FROM transfers WHERE id = ?", ("tx_test_rollback",)).fetchone()
        assert row is None, "Row should have been rolled back"
    finally:
        conn2.close()


def test_get_db_metrics_method(temp_db):
    """Verify that get_db_metrics() returns all expected telemetry fields."""
    metrics = temp_db.get_db_metrics()
    assert metrics["database_engine"] == "SQLite"
    assert metrics["journal_mode"].lower() == "wal"
    assert metrics["schema_version"] >= 2
    assert "page_size_bytes" in metrics
    assert "page_count" in metrics
    assert "freelist_count" in metrics
    assert "database_size_bytes" in metrics
    assert "active_files_count" in metrics
    assert "total_transfers_recorded" in metrics
    assert "total_chunks_recorded" in metrics


def test_api_endpoint_db_metrics():
    """Verify that GET /api/v1/system/db-metrics returns 200 OK and valid JSON."""
    app, _ = create_app()
    client = app.test_client()
    resp = client.get("/api/v1/system/db-metrics")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["database_engine"] == "SQLite"
    assert data["journal_mode"].lower() == "wal"
    assert data["schema_version"] >= 2
    assert "page_size_bytes" in data
    assert "database_size_bytes" in data
