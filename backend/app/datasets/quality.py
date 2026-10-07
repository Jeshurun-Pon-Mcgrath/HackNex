import re
from collections import Counter
from decimal import Decimal, InvalidOperation
from typing import Any

from app.datasets.csv_parser import ParsedTable
from app.datasets.models import FindingSeverity, QualityFinding, QualityProfile, SchemaProfile
from app.datasets.profiler import classify, is_missing

ROW_REFERENCE_LIMIT = 20
CURRENCY = re.compile(r"(?i)(?<![A-Z])(USD|EUR|GBP|JPY|INR|CAD|AUD)(?![A-Z])|[$€£¥₹]")
AMBIGUOUS_DATE = re.compile(r"^(0?[1-9]|1[0-2])[/.-](0?[1-9]|1[0-2])[/.-]\d{2,4}$")
DATE_SHAPE = re.compile(r"^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$")


def _finding(
    check: str,
    severity: FindingSeverity,
    message: str,
    count: int,
    column: str | None = None,
    rows: list[int] | None = None,
    details: dict[str, Any] | None = None,
) -> QualityFinding:
    suffix = column or "dataset"
    return QualityFinding(
        finding_id=f"{check}:{suffix}",
        check_type=check,
        severity=severity,
        column_id=column,
        message=message,
        affected_count=count,
        row_references=(rows or [])[:ROW_REFERENCE_LIMIT],
        details=details or {},
    )


def _number(value: Any) -> float | None:
    if is_missing(value) or isinstance(value, bool):
        return None
    try:
        return float(Decimal(str(value).replace(",", "").strip()))
    except (InvalidOperation, ValueError):
        return None


def _percentile(values: list[float], percentile: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * percentile
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def quality_profile(
    dataset_id: str, revision: int, table: ParsedTable, schema: SchemaProfile
) -> QualityProfile:
    findings: list[QualityFinding] = []
    ids = [column.column_id for column in schema.columns]
    normalized_rows: list[tuple[str, ...]] = []
    for source_row in table.rows:
        normalized_rows.append(
            tuple(
                "" if is_missing(value) else str(value).strip() for value in source_row[: len(ids)]
            )
        )
    first_seen: dict[tuple[str, ...], int] = {}
    duplicates: list[int] = []
    for row_number, normalized_row in enumerate(normalized_rows, start=2):
        if normalized_row in first_seen:
            duplicates.append(row_number)
        else:
            first_seen[normalized_row] = row_number
    findings.append(
        _finding(
            "exact_duplicate_rows",
            "warning" if duplicates else "passed",
            f"{len(duplicates)} exact duplicate rows found."
            if duplicates
            else "No exact duplicate rows found.",
            len(duplicates),
            rows=duplicates,
        )
    )

    stripped = [header.strip() for header in table.headers]
    lower_counts = Counter(header.lower() for header in stripped if header)
    exact_counts = Counter(stripped)
    for position, (header, column_id) in enumerate(zip(table.headers, ids, strict=True)):
        if not header.strip():
            findings.append(
                _finding("blank_header", "warning", "Column header is blank.", 1, column_id)
            )
        if header != header.strip():
            findings.append(
                _finding(
                    "header_whitespace",
                    "warning",
                    "Header has surrounding whitespace.",
                    1,
                    column_id,
                )
            )
        if header.strip() and exact_counts[header.strip()] > 1:
            findings.append(
                _finding(
                    "duplicate_header",
                    "warning",
                    "Header is duplicated.",
                    exact_counts[header.strip()],
                    column_id,
                )
            )
        variants = {item for item in stripped if item.lower() == header.strip().lower()}
        if header.strip() and lower_counts[header.strip().lower()] > 1 and len(variants) > 1:
            findings.append(
                _finding(
                    "case_collision",
                    "warning",
                    "Header differs from another only by case.",
                    len(variants),
                    column_id,
                )
            )

        values = [row[position] if position < len(row) else None for row in table.rows]
        missing_rows = [number for number, value in enumerate(values, start=2) if is_missing(value)]
        findings.append(
            _finding(
                "missing_values",
                "warning" if missing_rows else "passed",
                f"{len(missing_rows)} missing values found."
                if missing_rows
                else "No missing values found.",
                len(missing_rows),
                column_id,
                missing_rows,
            )
        )
        inferred = schema.columns[position].inferred_type
        expected = (
            {"Integer", "Decimal"} if inferred in {"Integer", "Decimal", "Mixed"} else {inferred}
        )
        kinds = [classify(value) for value in values if not is_missing(value)]
        dominant = Counter(kinds).most_common(1)[0][0] if kinds else "Empty"
        invalid_rows = [
            number
            for number, value in enumerate(values, start=2)
            if not is_missing(value)
            and dominant in {"Integer", "Decimal", "Boolean", "Date"}
            and classify(value) not in expected
        ]
        if invalid_rows:
            findings.append(
                _finding(
                    "invalid_type",
                    "warning",
                    "Values incompatible with the dominant type were found.",
                    len(invalid_rows),
                    column_id,
                    invalid_rows,
                )
            )

        date_values = [
            str(value).strip()
            for value in values
            if not is_missing(value) and DATE_SHAPE.fullmatch(str(value).strip())
        ]
        ambiguous_rows = [
            number
            for number, value in enumerate(values, start=2)
            if not is_missing(value) and AMBIGUOUS_DATE.fullmatch(str(value).strip())
        ]
        separators = {next((char for char in text if char in "/.-"), "") for text in date_values}
        if ambiguous_rows:
            findings.append(
                _finding(
                    "ambiguous_date",
                    "warning",
                    "Date values are ambiguous without a locale decision.",
                    len(ambiguous_rows),
                    column_id,
                    ambiguous_rows,
                )
            )
        if len(separators) > 1:
            findings.append(
                _finding(
                    "mixed_date_formats",
                    "warning",
                    "Multiple date formats were detected.",
                    len(date_values),
                    column_id,
                )
            )

        currencies: set[str] = set()
        for value in values:
            for match in CURRENCY.finditer(str(value)):
                currencies.add(match.group(0).upper())
        if len(currencies) > 1:
            findings.append(
                _finding(
                    "mixed_currencies",
                    "warning",
                    "Multiple explicit currencies were detected.",
                    len(currencies),
                    column_id,
                    details={"currencies": sorted(currencies)},
                )
            )

        numbers = [
            (number, parsed)
            for number, value in enumerate(values, start=2)
            if (parsed := _number(value)) is not None
        ]
        if len(numbers) >= 4:
            numeric_values = [item[1] for item in numbers]
            q1, q3 = _percentile(numeric_values, 0.25), _percentile(numeric_values, 0.75)
            iqr = q3 - q1
            lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
            outlier_rows = [row for row, value in numbers if value < lower or value > upper]
            findings.append(
                _finding(
                    "numeric_outliers",
                    "information" if outlier_rows else "passed",
                    f"{len(outlier_rows)} potential IQR outliers found.",
                    len(outlier_rows),
                    column_id,
                    outlier_rows,
                    {"q1": q1, "q3": q3, "iqr": iqr, "lower_bound": lower, "upper_bound": upper},
                )
            )
        if position in table.formula_columns:
            findings.append(
                _finding(
                    "formula_cells",
                    "warning",
                    "Formula cells are present and were not evaluated.",
                    1,
                    column_id,
                )
            )
    return QualityProfile(dataset_id=dataset_id, dataset_revision=revision, findings=findings)
