import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import polars as pl

from app.core.errors import AppError


@dataclass
class ParsedTable:
    headers: list[str]
    rows: list[list[Any]]
    warnings: list[str]
    formula_columns: set[int]


def parse_csv(path: Path) -> ParsedTable:
    text = path.read_text(encoding="utf-8-sig")
    nonempty_lines = [line for line in text.splitlines() if line.strip()]
    if len(nonempty_lines) < 2:
        raise AppError(422, "no_data_rows", "CSV must contain a header and at least one data row.")
    try:
        dialect = csv.Sniffer().sniff("\n".join(nonempty_lines[:20]), delimiters=",;\t|")
        delimiter = dialect.delimiter
        warnings: list[str] = []
    except csv.Error:
        delimiter = ","
        warnings = ["Delimiter could not be determined confidently; comma was used."]
    try:
        raw_headers = next(csv.reader([nonempty_lines[0]], delimiter=delimiter))
        frame = pl.read_csv(
            path,
            separator=delimiter,
            encoding="utf8-lossy",
            infer_schema=False,
            truncate_ragged_lines=False,
            ignore_errors=False,
        )
    except (csv.Error, pl.exceptions.PolarsError) as exc:
        raise AppError(422, "malformed_csv", "CSV rows are malformed or inconsistent.") from exc
    rows = [list(row) for row in frame.iter_rows()]
    while rows and all(_missing(value) for value in rows[-1]):
        rows.pop()
    if not raw_headers or all(not header.strip() for header in raw_headers):
        raise AppError(422, "no_usable_header", "CSV has no usable header.")
    if not rows:
        raise AppError(422, "no_data_rows", "CSV has no usable data rows.")
    return ParsedTable(raw_headers, rows, warnings, set())


def _missing(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())
