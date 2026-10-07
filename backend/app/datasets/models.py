from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field

type InferredType = Literal["Integer", "Decimal", "Boolean", "Date", "Text", "Empty", "Mixed"]
type FindingSeverity = Literal["error", "warning", "information", "passed"]


class DatasetStatus(StrEnum):
    UPLOADING = "uploading"
    AWAITING_SHEET_SELECTION = "awaiting_sheet_selection"
    PROFILING = "profiling"
    READY = "ready"
    FAILED = "failed"
    DELETING = "deleting"
    EXPIRED = "expired"


class WorksheetInfo(BaseModel):
    name: str
    index: int
    visibility: Literal["visible", "hidden", "veryHidden"]
    usable: bool


class DatasetRecord(BaseModel):
    dataset_id: str
    original_filename: str
    stored_filename: str = Field(exclude=True)
    file_type: Literal["csv", "xlsx"]
    size_bytes: int
    sha256: str
    status: DatasetStatus
    available_sheets: list[WorksheetInfo]
    selected_sheet: str | None = None
    row_count: int | None = None
    column_count: int | None = None
    revision: int
    created_at: datetime
    updated_at: datetime
    expires_at: datetime


class ColumnProfile(BaseModel):
    column_id: str
    original_name: str
    position: int
    inferred_type: InferredType
    nullable: bool
    missing_count: int
    missing_percentage: float
    non_missing_count: int
    unique_count: int
    sample_values: list[str]


class SchemaProfile(BaseModel):
    dataset_id: str
    dataset_revision: int
    row_count: int
    column_count: int
    columns: list[ColumnProfile]
    warnings: list[str] = Field(default_factory=list)


class QualityFinding(BaseModel):
    finding_id: str
    check_type: str
    severity: FindingSeverity
    column_id: str | None = None
    message: str
    affected_count: int
    row_references: list[int] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class QualityProfile(BaseModel):
    dataset_id: str
    dataset_revision: int
    findings: list[QualityFinding]


class SelectSheetRequest(BaseModel):
    sheet_name: str = Field(min_length=1, max_length=255)
