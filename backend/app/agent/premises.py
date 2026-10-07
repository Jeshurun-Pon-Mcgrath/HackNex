"""Premise Audit: deterministically check what a question assumes exists in the data."""

import re
from datetime import date

import pandas as pd

from app.agent.scan import ISO_DATE, SLASH_DATE, date_columns, is_missing
from app.agent.workspace import Workspace


def data_date_range(ws: Workspace) -> tuple[date, date] | None:
    """Earliest/latest date across all date columns, under every DD/MM-vs-MM/DD reading."""
    seen: list[pd.Timestamp] = []
    for table in ws.tables:
        for column in date_columns(table):
            values = table.raw[column].str.strip()
            values = values[~values.map(is_missing)]
            iso = values[values.str.match(ISO_DATE)].str[:10]
            slash = values[values.str.match(SLASH_DATE)]
            for parsed in (
                pd.to_datetime(iso, format="%Y-%m-%d", errors="coerce"),
                pd.to_datetime(slash, dayfirst=True, errors="coerce"),
                pd.to_datetime(slash, dayfirst=False, errors="coerce"),
            ):
                seen.extend(parsed.dropna().tolist())
    if not seen:
        return None
    return min(seen).date(), max(seen).date()


def _period(value: str) -> tuple[date, date] | None:
    value = value.strip().upper()
    if m := re.fullmatch(r"(\d{4})", value):
        y = int(m[1])
        return date(y, 1, 1), date(y, 12, 31)
    if m := re.fullmatch(r"(\d{4})-(\d{1,2})", value):
        y, mo = int(m[1]), int(m[2])
        if not 1 <= mo <= 12:
            return None
        end = (pd.Timestamp(y, mo, 1) + pd.offsets.MonthEnd(0)).date()
        return date(y, mo, 1), end
    if m := re.fullmatch(r"(\d{4})-?Q([1-4])", value):
        y, q = int(m[1]), int(m[2])
        end = (pd.Timestamp(y, 3 * q, 1) + pd.offsets.MonthEnd(0)).date()
        return date(y, 3 * q - 2, 1), end
    return None


def _find_column(ws: Workspace, column: str) -> list[tuple[str, str]]:
    wanted = column.strip().lower()
    return [
        (t.name, str(c))
        for t in ws.tables
        for c in t.raw.columns
        if str(c).strip().lower() == wanted
    ]


def check(ws: Workspace, premise: dict[str, str]) -> tuple[bool, str]:
    kind = premise.get("kind", "")
    value = str(premise.get("value", "")).strip()
    column = str(premise.get("column", "")).strip()
    if kind == "column":
        name = column or value
        hits = _find_column(ws, name)
        if hits:
            return True, f"column '{name}' exists in {', '.join(t for t, _ in hits)}"
        return False, f"no table has a column named '{name}'"
    if kind == "value":
        needle = value.lower()
        if not needle:
            return True, "empty value premise ignored"
        for t in ws.tables:
            frame = t.raw.apply(lambda s: s.str.lower())
            if frame.apply(lambda s, n=needle: s.str.contains(n, regex=False)).any().any():
                return True, f"'{value}' appears in {t.name}"
        if any(needle in text.lower() for text in ws.documents.values()):
            return True, f"'{value}' appears in a document"
        return False, f"'{value}' does not appear anywhere in the data or documents"
    if kind == "date":
        m = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", value)
        if not m:
            return True, f"date '{value}' not in YYYY-MM-DD form; not checked"
        try:
            day = date(int(m[1]), int(m[2]), int(m[3]))
        except ValueError:
            return False, f"{value} is not a real calendar date"
        span = data_date_range(ws)
        if span and not span[0] <= day <= span[1]:
            return False, f"{value} is outside the data's date range {span[0]} to {span[1]}"
        return True, f"{value} is a valid date within the data"
    if kind == "period":
        period = _period(value)
        span = data_date_range(ws)
        if not period or not span:
            return True, f"period '{value}' not checked"
        if period[1] < span[0] or period[0] > span[1]:
            return False, (
                f"period {value} ({period[0]} to {period[1]}) has no overlap with the data, "
                f"which covers {span[0]} to {span[1]}"
            )
        if period[0] < span[0] or period[1] > span[1]:
            return True, (
                f"period {value} only partly overlaps the data ({span[0]} to {span[1]}); "
                "results cover the overlapping part only"
            )
        return True, f"period {value} is covered by the data"
    return True, f"premise kind '{kind}' not checked"


def entities(ws: Workspace, question: str, values: list[str]) -> set[str]:
    """Question values that exactly match a data cell (e.g. 'Widgets' -> 'Widget').

    Code that answers the question must filter on these, or it silently answers about everything.
    """
    asked = question.lower()
    found: set[str] = set()
    for value in values:
        v = value.strip().lower()
        if len(v) < 2 or v not in asked:
            continue
        forms = {v, v.removesuffix("s"), v.removesuffix("es")}
        for t in ws.tables:
            cells = {str(c).strip().lower(): str(c).strip() for c in t.raw.to_numpy().ravel()}
            found |= {cells[f] for f in forms if f in cells}
    return found
