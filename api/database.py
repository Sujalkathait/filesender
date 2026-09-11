"""
FileShare Database Manager
Manages SQLite connection lifecycle, schema initialization, WAL mode, and indexes.

Concurrency notes:
- WAL mode allows concurrent readers with a single writer.
- busy_timeout makes concurrent writers wait instead of failing instantly.
- Indexes keep expiry sweeps and transfer lookups fast even with many files.
"""

import os
import sqlite3
from contextlib import contextmanager

from api.config import DB_PATH


class DatabaseManager:
    """SQLite database manager with schema auto-migration, WAL mode, and ACID transactions."""

    SCHEMA_VERSION = 2

    def __init__(self, db_path: str = None):
        self.db_path = db_path or DB_PATH
        db_dir = os.path.dirname(self.db_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)
        self.init_database()

    def get_connection(self):
        """Open a connection with safe concurrency and performance settings."""
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout = 10000")
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA synchronous = NORMAL")
        conn.execute("PRAGMA cache_size = -64000")  # 64 MB in-memory cache
        conn.execute("PRAGMA temp_store = MEMORY")   # Keep temporary indices/tables in RAM
        return conn

    @contextmanager
    def transaction(self):
        """Context manager for ACID transaction management with auto-commit and rollback."""
        conn = self.get_connection()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def init_database(self):
        conn = self.get_connection()
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        conn.execute("PRAGMA cache_size = -64000")
        conn.execute("PRAGMA temp_store = MEMORY")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                transfer_id TEXT,
                filename TEXT NOT NULL,
                original_name TEXT NOT NULL,
                original_size INTEGER NOT NULL,
                encrypted_size INTEGER NOT NULL,
                mime_type TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                download_count INTEGER DEFAULT 0,
                max_downloads INTEGER DEFAULT 10,
                iv TEXT NOT NULL,
                salt TEXT NOT NULL,
                checksum TEXT,
                compressed INTEGER DEFAULT 1,
                burn_on_read INTEGER DEFAULT 0,
                preview_count INTEGER DEFAULT 0,
                max_previews INTEGER DEFAULT 2,
                status TEXT DEFAULT 'ready',
                client_id TEXT,
                access_hash TEXT,
                wrapped_key TEXT,
                wrap_iv TEXT,
                reserved_at TIMESTAMP,
                failed_proof_count INTEGER DEFAULT 0,
                locked_until TIMESTAMP
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS transfers (
                id TEXT PRIMARY KEY,
                token_hash TEXT,
                client_id TEXT,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                completed_at TIMESTAMP,
                total_size INTEGER DEFAULT 0,
                file_count INTEGER DEFAULT 1,
                sharing_mode TEXT DEFAULT 'standard',
                refresh_count INTEGER DEFAULT 0,
                max_refreshes INTEGER DEFAULT 5,
                burn_on_read INTEGER DEFAULT 0
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS chunks (
                id TEXT PRIMARY KEY,
                transfer_id TEXT,
                file_id TEXT,
                chunk_index INTEGER,
                total_chunks INTEGER,
                chunk_size INTEGER,
                checksum TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Add missing columns safely if upgrading existing DB
        columns_to_add = [
            ("files", "transfer_id", "TEXT"),
            ("files", "burn_on_read", "INTEGER DEFAULT 0"),
            ("files", "status", "TEXT DEFAULT 'ready'"),
            ("files", "preview_count", "INTEGER DEFAULT 0"),
            ("files", "max_previews", "INTEGER DEFAULT 2"),
            ("files", "client_id", "TEXT"),
            ("files", "access_hash", "TEXT"),
            ("transfers", "client_id", "TEXT"),
            ("transfers", "token_hash", "TEXT"),
            ("transfers", "refresh_count", "INTEGER DEFAULT 0"),
            ("transfers", "max_refreshes", "INTEGER DEFAULT 5"),
            ("transfers", "total_size", "INTEGER DEFAULT 0"),
            ("transfers", "file_count", "INTEGER DEFAULT 1"),
            ("transfers", "sharing_mode", "TEXT DEFAULT 'standard'"),
            ("transfers", "burn_on_read", "INTEGER DEFAULT 0"),
            ("transfers", "expires_at", "TIMESTAMP"),
            ("files", "wrapped_key", "TEXT"),
            ("files", "wrap_iv", "TEXT"),
            ("files", "reserved_at", "TIMESTAMP"),
            ("files", "failed_proof_count", "INTEGER DEFAULT 0"),
            ("files", "locked_until", "TIMESTAMP")
        ]
        for table, col, col_type in columns_to_add:
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")
            except sqlite3.OperationalError:
                pass

        # Try to drop sender_ip and receiver_ip (SQLite ALTER TABLE DROP COLUMN is supported in newer versions, but we can safely ignore errors)
        for col in ["sender_ip", "receiver_ip"]:
            try:
                conn.execute(f"ALTER TABLE transfers DROP COLUMN {col}")
            except sqlite3.OperationalError:
                pass

        # Indexes for the queries that run most often (expiry sweeps, lookups, reservations, client quota)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_files_expires ON files(expires_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_files_transfer ON files(transfer_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_files_client_id ON files(client_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_files_status_reserved ON files(status, reserved_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_transfers_expires ON transfers(expires_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_transfers_client_id ON transfers(client_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_chunks_transfer ON chunks(transfer_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id)")

        # High-Performance Composite Indexes for Scalability
        conn.execute("CREATE INDEX IF NOT EXISTS idx_files_expires_status ON files(expires_at, status)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_chunks_composite ON chunks(transfer_id, chunk_index)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_transfers_token_hash ON transfers(token_hash)")

        # Schema Version Tracking
        conn.execute(f"PRAGMA user_version = {self.SCHEMA_VERSION}")

        conn.commit()
        conn.close()

    def get_db_metrics(self) -> dict:
        """Collect database performance, sizing, and storage telemetry."""
        conn = self.get_connection()
        try:
            page_size = conn.execute("PRAGMA page_size").fetchone()[0]
            page_count = conn.execute("PRAGMA page_count").fetchone()[0]
            freelist_count = conn.execute("PRAGMA freelist_count").fetchone()[0]
            journal_mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
            user_version = conn.execute("PRAGMA user_version").fetchone()[0]

            files_count = conn.execute("SELECT COUNT(*) FROM files").fetchone()[0]
            active_files = conn.execute("SELECT COUNT(*) FROM files WHERE status != 'burned'").fetchone()[0]
            transfers_count = conn.execute("SELECT COUNT(*) FROM transfers").fetchone()[0]
            chunks_count = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]

            db_file_size = 0
            if os.path.exists(self.db_path):
                db_file_size = os.path.getsize(self.db_path)

            wal_file_size = 0
            wal_path = f"{self.db_path}-wal"
            if os.path.exists(wal_path):
                wal_file_size = os.path.getsize(wal_path)

            return {
                "database_engine": "SQLite",
                "journal_mode": journal_mode,
                "schema_version": user_version,
                "page_size_bytes": page_size,
                "page_count": page_count,
                "freelist_count": freelist_count,
                "database_size_bytes": db_file_size or (page_count * page_size),
                "wal_size_bytes": wal_file_size,
                "active_files_count": active_files,
                "total_files_recorded": files_count,
                "total_transfers_recorded": transfers_count,
                "total_chunks_recorded": chunks_count,
                "concurrency_mode": "WAL (Concurrent Readers + Single Writer with Busy Timeout)",
                "cache_size_kb": 64000
            }
        finally:
            conn.close()

