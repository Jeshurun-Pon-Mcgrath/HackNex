import re
from collections import Counter
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from app.datasets.csv_parser import ParsedTable
from app.datasets.models import ColumnProfile, InferredType, SchemaProfile

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$")
BOOLEAN_VALUES = {"true", "false", "yes", "no"}
SAMPLE_MAX_LENGTH = 120


def is_missing(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def stable_column_ids(headers: list[str]) -> list[str]:
    counts: Counter[str] = Counter()
    identifiers: list[str] = []
    for position, header in enumerate(headers):
        base = (
            re.sub(r"[^a-z0-9]+", "_", header.strip().lower()).strip("_")
            or f"column_{position + 1}"
        )
        counts[base] += 1
        identifiers.append(base if counts[base] == 1 else f"{base}__{counts[base]}")
    return identifiers


def classify(value: Any) -> InferredType:
    if is_missing(value):
        return "Empty"
    if isinstance(value, bool):
        return "Boolean"
    if isinstance(value, int):
        return "Integer"
    if isinstance(value, float | Decimal):
        return "Decimal"
    if isinstance(value, datetime | date):
        return "Date"
    text = str(value).strip()
    lowered = text.lower()
    if lowered in BOOLEAN_VALUES:
        return "Boolean"
    try:
        decimal = Decimal(text.replace(",", ""))
        return (
            "Integer" if decimal == decimal.to_integral_value() and "." not in text else "Decimal"
        )
    except InvalidOperation:
        pass
    if ISO_DATE.fullmatch(text):
        try:
            datetime.fromisoformat(text.replace("Z", "+00:00"))
            return "Date"
        except ValueError:
            pass
    return "Text"


def infer_type(values: list[Any]) -> InferredType:
    kinds: set[InferredType] = {kind for value in values if (kind := classify(value)) != "Empty"}
    if not kinds:
        return "Empty"
    if kinds <= {"Integer"}:
        return "Integer"
    if kinds <= {"Integer", "Decimal"}:
        return "Decimal"
    if len(kinds) == 1:
        return next(iter(kinds))
    # A mostly consistent typed column with a few textual exceptions is Mixed.
    typed = sum(classify(value) != "Text" for value in values if not is_missing(value))
    nonmissing = sum(not is_missing(value) for value in values)
    return "Mixed" if typed >= max(1, nonmissing // 2) else "Text"


def profile_table(dataset_id: str, revision: int, table: ParsedTable) -> SchemaProfile:
    identifiers = stable_column_ids(table.headers)
    columns: list[ColumnProfile] = []
    row_count = len(table.rows)
    for position, (identifier, header) in enumerate(zip(identifiers, table.headers, strict=True)):
        values = [row[position] if position < len(row) else None for row in table.rows]
        missing = sum(is_missing(value) for value in values)
        samples: list[str] = []
        for value in values:
            rendered = str(value)
            if not is_missing(value) and rendered not in samples:
                samples.append(rendered[:SAMPLE_MAX_LENGTH])
            if len(samples) == 5:
                break
        normalized = {str(value).strip() for value in values if not is_missing(value)}
        columns.append(
            ColumnProfile(
                column_id=identifier,
                original_name=header,
                position=position,
                inferred_type=infer_type(values),
                nullable=missing > 0,
                missing_count=missing,
                missing_percentage=round(missing * 100 / row_count, 2),
                non_missing_count=row_count - missing,
                unique_count=len(normalized),
                sample_values=samples,
            )
        )
    return SchemaProfile(
        dataset_id=dataset_id,
        dataset_revision=revision,
        row_count=row_count,
        column_count=len(columns),
        columns=columns,
        warnings=table.warnings,
    )
