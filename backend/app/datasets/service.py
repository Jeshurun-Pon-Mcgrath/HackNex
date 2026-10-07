from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import Settings
from app.core.errors import AppError
from app.core.logging import log_event
from app.core.security import contained_path, validate_original_filename
from app.datasets.csv_parser import ParsedTable, parse_csv
from app.datasets.models import DatasetRecord, DatasetStatus, QualityProfile, SchemaProfile
from app.datasets.profiler import profile_table
from app.datasets.quality import quality_profile
from app.datasets.storage import delete_stored_file, store_upload
from app.datasets.validation import validate_csv_bytes, validate_xlsx_container
from app.datasets.xlsx_parser import inspect_workbook, parse_sheet
from app.db.repositories import DatasetRepository


class DatasetService:
    def __init__(self, settings: Settings, repository: DatasetRepository) -> None:
        self.settings = settings
        self.repository = repository

    def _active(self, dataset_id: str) -> DatasetRecord:
        record = self.repository.get(dataset_id)
        if not record:
            raise AppError(404, "dataset_not_found", "The dataset was not found.")
        if record.expires_at <= datetime.now(UTC) or record.status == DatasetStatus.EXPIRED:
            raise AppError(410, "dataset_expired", "The dataset has expired.")
        return record

    async def upload(self, upload: UploadFile) -> DatasetRecord:
        original_name, file_type = validate_original_filename(upload.filename)
        stored_name, size, sha256 = await store_upload(
            upload, self.settings.data_dir, file_type, self.settings.max_upload_bytes
        )
        path = contained_path(self.settings.data_dir, stored_name)
        now = datetime.now(UTC)
        dataset_id = str(uuid4())
        record = DatasetRecord(
            dataset_id=dataset_id,
            original_filename=original_name,
            stored_filename=stored_name,
            file_type=file_type,
            size_bytes=size,
            sha256=sha256,
            status=DatasetStatus.UPLOADING,
            available_sheets=[],
            revision=1,
            created_at=now,
            updated_at=now,
            expires_at=now + timedelta(hours=self.settings.dataset_ttl_hours),
        )
        try:
            if file_type == "csv":
                validate_csv_bytes(path)
                table = parse_csv(path)
                self.repository.create(record)
                self._save_profile(record, table, selected_sheet=None)
            else:
                validate_xlsx_container(path)
                sheets = inspect_workbook(path)
                usable = [
                    sheet for sheet in sheets if sheet.usable and sheet.visibility == "visible"
                ]
                if not usable:
                    raise AppError(
                        422, "no_usable_sheet", "Workbook has no usable visible worksheet."
                    )
                record.available_sheets = sheets
                self.repository.create(record)
                if len(usable) == 1:
                    self._save_profile(
                        record, parse_sheet(path, usable[0].name), selected_sheet=usable[0].name
                    )
                else:
                    self.repository.update_state(
                        dataset_id,
                        DatasetStatus.AWAITING_SHEET_SELECTION,
                        sheets=[sheet.model_dump() for sheet in sheets],
                    )
            saved = self._active(dataset_id)
            log_event(
                "dataset_registered",
                dataset_id=dataset_id,
                file_type=file_type,
                size_bytes=size,
                status=saved.status,
            )
            return saved
        except Exception:
            if self.repository.get(dataset_id):
                self.repository.delete(dataset_id)
            delete_stored_file(self.settings.data_dir, stored_name)
            raise

    def _save_profile(
        self,
        record: DatasetRecord,
        table: ParsedTable,
        selected_sheet: str | None,
        *,
        selection: bool = False,
    ) -> None:
        revision = record.revision + int(selection)
        schema = profile_table(record.dataset_id, revision, table)
        quality = quality_profile(record.dataset_id, revision, table, schema)
        self.repository.save_profiles_and_ready(
            schema,
            quality,
            sheets=[sheet.model_dump() for sheet in record.available_sheets],
            selected_sheet=selected_sheet,
            increment_revision=selection,
        )

    def get(self, dataset_id: str) -> DatasetRecord:
        return self._active(dataset_id)

    def profiles(self, dataset_id: str) -> tuple[SchemaProfile, QualityProfile]:
        record = self._active(dataset_id)
        if record.status != DatasetStatus.READY:
            raise AppError(409, "dataset_not_ready", "The dataset is not ready for this operation.")
        profiles = self.repository.profiles(dataset_id)
        if not profiles:
            raise AppError(409, "profile_unavailable", "The dataset profile is unavailable.")
        return profiles

    def select_sheet(self, dataset_id: str, sheet_name: str) -> DatasetRecord:
        record = self._active(dataset_id)
        if record.file_type != "xlsx":
            raise AppError(
                422, "not_a_workbook", "Worksheet selection applies only to XLSX datasets."
            )
        allowed = {
            sheet.name
            for sheet in record.available_sheets
            if sheet.usable and sheet.visibility == "visible"
        }
        if sheet_name not in allowed:
            raise AppError(
                422,
                "invalid_sheet",
                "Select a usable visible worksheet.",
                [{"field": "sheet_name", "message": "Worksheet is absent, hidden, or empty."}],
            )
        path = contained_path(self.settings.data_dir, record.stored_filename)
        self._save_profile(record, parse_sheet(path, sheet_name), sheet_name, selection=True)
        selected = self._active(dataset_id)
        log_event(
            "dataset_sheet_selected",
            dataset_id=dataset_id,
            dataset_revision=selected.revision,
        )
        return selected

    def delete(self, dataset_id: str) -> bool:
        record = self.repository.mark_deleting(dataset_id)
        if not record:
            return False
        delete_stored_file(self.settings.data_dir, record.stored_filename)
        self.repository.delete(dataset_id)
        log_event("dataset_deleted", dataset_id=dataset_id)
        return True

    def cleanup_expired(self) -> tuple[int, int]:
        deleted = failed = 0
        for record in self.repository.expired(datetime.now(UTC)):
            try:
                self.delete(record.dataset_id)
                deleted += 1
            except Exception:
                failed += 1
                log_event("expired_dataset_deletion_failed", dataset_id=record.dataset_id)
        log_event("expired_dataset_cleanup", deleted=deleted, failed=failed)
        return deleted, failed
