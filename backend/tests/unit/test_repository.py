from datetime import UTC, datetime, timedelta

from app.datasets.models import DatasetRecord, DatasetStatus
from app.db.connection import Database
from app.db.migrations import migrate
from app.db.repositories import DatasetRepository


def test_repository_create_update_and_expiry(settings: object) -> None:
    database = Database(settings.database_path)  # type: ignore[attr-defined]
    database.open()
    try:
        migrate(database.require())
        repository = DatasetRepository(database.require())
        now = datetime.now(UTC)
        record = DatasetRecord(
            dataset_id="id",
            original_filename="a.csv",
            stored_filename="opaque.csv",
            file_type="csv",
            size_bytes=10,
            sha256="0" * 64,
            status=DatasetStatus.UPLOADING,
            available_sheets=[],
            revision=1,
            created_at=now,
            updated_at=now,
            expires_at=now - timedelta(seconds=1),
        )
        repository.create(record)
        assert repository.get("id") is not None
        assert [item.dataset_id for item in repository.expired(now)] == ["id"]
        repository.update_state("id", DatasetStatus.READY, row_count=1, column_count=1)
        assert repository.get("id").status == DatasetStatus.READY  # type: ignore[union-attr]
    finally:
        database.close()
