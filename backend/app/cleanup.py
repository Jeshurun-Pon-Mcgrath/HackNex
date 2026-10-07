from app.core.config import get_settings
from app.datasets.service import DatasetService
from app.db.connection import Database
from app.db.migrations import migrate
from app.db.repositories import DatasetRepository


def main() -> None:
    settings = get_settings()
    database = Database(settings.database_path)
    database.open()
    try:
        migrate(database.require())
        deleted, failed = DatasetService(
            settings, DatasetRepository(database.require())
        ).cleanup_expired()
        print(f"expired datasets deleted={deleted} failed={failed}")
    finally:
        database.close()


if __name__ == "__main__":
    main()
