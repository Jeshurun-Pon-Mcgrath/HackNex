from sqlite3 import Connection


def migrate(connection: Connection) -> None:
    with connection:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)"
        )
        version = connection.execute(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations"
        ).fetchone()[0]
        if version < 1:
            connection.executescript(
                """
                CREATE TABLE datasets (
                    dataset_id TEXT PRIMARY KEY,
                    original_filename TEXT NOT NULL,
                    stored_filename TEXT NOT NULL UNIQUE,
                    file_type TEXT NOT NULL CHECK(file_type IN ('csv','xlsx')),
                    size_bytes INTEGER NOT NULL,
                    sha256 TEXT NOT NULL,
                    status TEXT NOT NULL,
                    available_sheets TEXT NOT NULL DEFAULT '[]',
                    selected_sheet TEXT,
                    row_count INTEGER,
                    column_count INTEGER,
                    revision INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );
                CREATE TABLE profiles (
                    dataset_id TEXT PRIMARY KEY REFERENCES datasets(dataset_id) ON DELETE CASCADE,
                    schema_json TEXT NOT NULL,
                    quality_json TEXT NOT NULL
                );
                CREATE INDEX datasets_expiry_idx ON datasets(expires_at, status);
                INSERT INTO schema_migrations(version) VALUES (1);
                """
            )
