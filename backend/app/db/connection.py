import sqlite3
from pathlib import Path


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.connection: sqlite3.Connection | None = None

    def open(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")

    def close(self) -> None:
        if self.connection is not None:
            self.connection.close()
            self.connection = None

    def check(self) -> bool:
        if self.connection is None:
            return False
        try:
            return bool(self.connection.execute("SELECT 1").fetchone()[0] == 1)
        except sqlite3.Error:
            return False

    def require(self) -> sqlite3.Connection:
        if self.connection is None:
            raise RuntimeError("database is not open")
        return self.connection
