import json
from datetime import UTC, datetime
from sqlite3 import Connection, Row

from app.datasets.models import DatasetRecord, QualityProfile, SchemaProfile


class DatasetRepository:
    def __init__(self, connection: Connection) -> None:
        self.connection = connection

    @staticmethod
    def _record(row: Row) -> DatasetRecord:
        data = dict(row)
        data["available_sheets"] = json.loads(data["available_sheets"])
        return DatasetRecord.model_validate(data)

    def create(self, record: DatasetRecord) -> None:
        values = record.model_dump(mode="json", exclude={"stored_filename"})
        values["stored_filename"] = record.stored_filename
        values["available_sheets"] = json.dumps(values["available_sheets"])
        columns = ",".join(values)
        marks = ",".join("?" for _ in values)
        with self.connection:
            self.connection.execute(
                f"INSERT INTO datasets ({columns}) VALUES ({marks})",  # noqa: S608
                tuple(values.values()),
            )

    def get(self, dataset_id: str) -> DatasetRecord | None:
        row = self.connection.execute(
            "SELECT * FROM datasets WHERE dataset_id = ?", (dataset_id,)
        ).fetchone()
        return self._record(row) if row else None

    def update_state(
        self,
        dataset_id: str,
        status: str,
        *,
        sheets: list[dict[str, object]] | None = None,
        selected_sheet: str | None = None,
        row_count: int | None = None,
        column_count: int | None = None,
        increment_revision: bool = False,
    ) -> None:
        with self.connection:
            cursor = self.connection.execute(
                """UPDATE datasets SET status=?, available_sheets=COALESCE(?,available_sheets),
                selected_sheet=?, row_count=?, column_count=?, updated_at=?,
                revision=revision+? WHERE dataset_id=?""",
                (
                    status,
                    json.dumps(sheets) if sheets is not None else None,
                    selected_sheet,
                    row_count,
                    column_count,
                    datetime.now(UTC).isoformat(),
                    int(increment_revision),
                    dataset_id,
                ),
            )
            if cursor.rowcount != 1:
                raise KeyError(dataset_id)

    def save_profiles(self, schema: SchemaProfile, quality: QualityProfile) -> None:
        with self.connection:
            self.connection.execute(
                """INSERT INTO profiles(dataset_id,schema_json,quality_json) VALUES(?,?,?)
                ON CONFLICT(dataset_id) DO UPDATE SET schema_json=excluded.schema_json,
                quality_json=excluded.quality_json""",
                (schema.dataset_id, schema.model_dump_json(), quality.model_dump_json()),
            )

    def save_profiles_and_ready(
        self,
        schema: SchemaProfile,
        quality: QualityProfile,
        *,
        sheets: list[dict[str, object]],
        selected_sheet: str | None,
        increment_revision: bool,
    ) -> None:
        """Replace profiles and publish their matching dataset revision atomically."""
        with self.connection:
            self.connection.execute(
                """INSERT INTO profiles(dataset_id,schema_json,quality_json) VALUES(?,?,?)
                ON CONFLICT(dataset_id) DO UPDATE SET schema_json=excluded.schema_json,
                quality_json=excluded.quality_json""",
                (schema.dataset_id, schema.model_dump_json(), quality.model_dump_json()),
            )
            cursor = self.connection.execute(
                """UPDATE datasets SET status='ready', available_sheets=?, selected_sheet=?,
                row_count=?, column_count=?, updated_at=?, revision=revision+?
                WHERE dataset_id=?""",
                (
                    json.dumps(sheets),
                    selected_sheet,
                    schema.row_count,
                    schema.column_count,
                    datetime.now(UTC).isoformat(),
                    int(increment_revision),
                    schema.dataset_id,
                ),
            )
            if cursor.rowcount != 1:
                raise KeyError(schema.dataset_id)

    def profiles(self, dataset_id: str) -> tuple[SchemaProfile, QualityProfile] | None:
        row = self.connection.execute(
            "SELECT schema_json, quality_json FROM profiles WHERE dataset_id=?", (dataset_id,)
        ).fetchone()
        if not row:
            return None
        return SchemaProfile.model_validate_json(row[0]), QualityProfile.model_validate_json(row[1])

    def mark_deleting(self, dataset_id: str) -> DatasetRecord | None:
        with self.connection:
            row = self.connection.execute(
                "SELECT * FROM datasets WHERE dataset_id=?", (dataset_id,)
            ).fetchone()
            if not row:
                return None
            self.connection.execute(
                "UPDATE datasets SET status='deleting',updated_at=? WHERE dataset_id=?",
                (datetime.now(UTC).isoformat(), dataset_id),
            )
        return self._record(row)

    def delete(self, dataset_id: str) -> None:
        with self.connection:
            self.connection.execute("DELETE FROM datasets WHERE dataset_id=?", (dataset_id,))

    def expired(self, now: datetime) -> list[DatasetRecord]:
        rows = self.connection.execute(
            "SELECT * FROM datasets WHERE expires_at <= ? AND status NOT IN ('deleting','expired')",
            (now.isoformat(),),
        ).fetchall()
        return [self._record(row) for row in rows]
