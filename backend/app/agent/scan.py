"""Deterministic trap scan. No LLM: these findings are facts the agent must answer to."""

import re
from dataclasses import asdict, dataclass, field
from itertools import combinations

import pandas as pd

from app.agent.workspace import Table

MISSING_MARKERS = {"", "na", "n/a", "null", "none", "nan", "-", "--", "error", "unknown", "#n/a"}
CURRENCY = re.compile(r"(\$|€|£|₹|¥|\bUSD\b|\bEUR\b|\bGBP\b|\bINR\b|\bJPY\b)", re.IGNORECASE)
CURRENCY_CODE = {"$": "USD", "€": "EUR", "£": "GBP", "₹": "INR", "¥": "JPY"}
ISO_DATE = re.compile(r"^\d{4}-\d{1,2}-\d{1,2}([ T].*)?$")
SLASH_DATE = re.compile(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$")


@dataclass
class Finding:
    id: str
    # duplicate_rows, duplicate_key, missing_values, mixed_currency, ambiguous_dates, contradiction
    kind: str
    tables: list[str]
    columns: list[str]
    message: str
    count: int
    examples: list[str] = field(default_factory=list)

    def dict(self) -> dict[str, object]:
        return asdict(self)


def is_missing(value: str) -> bool:
    return value.strip().lower() in MISSING_MARKERS


def _present(series: pd.Series) -> pd.Series:
    return series[~series.map(is_missing)]


def date_columns(table: Table) -> list[str]:
    result = []
    for column in table.raw.columns:
        values = _present(table.raw[column]).str.strip()
        if (
            len(values)
            and (values.str.match(ISO_DATE) | values.str.match(SLASH_DATE)).mean() >= 0.6
        ):
            result.append(column)
    return result


def _table_findings(table: Table) -> list[Finding]:
    found: list[Finding] = []
    raw = table.raw
    normalized = raw.apply(lambda s: s.str.strip().str.lower())
    dupes = int(normalized.duplicated().sum())
    if dupes:
        examples = raw[normalized.duplicated(keep=False)].head(3).to_dict("records")
        found.append(
            Finding(
                "",
                "duplicate_rows",
                [table.name],
                [],
                f"{dupes} row(s) are exact duplicates of an earlier row "
                "(after trimming/case-folding).",
                dupes,
                [str(e) for e in examples],
            )
        )
    key = next((c for c in raw.columns if str(c).lower().endswith("id")), None)
    if key is not None:
        key_dupes = int(normalized[key].duplicated().sum())
        if key_dupes > dupes and key == raw.columns[0]:
            found.append(
                Finding(
                    "",
                    "duplicate_key",
                    [table.name],
                    [str(key)],
                    f"'{key}' repeats in {key_dupes} rows but only {dupes} rows are "
                    "exact copies; some IDs have conflicting rows.",
                    key_dupes,
                )
            )

    for column in raw.columns:
        values = raw[column]
        missing = values[values.map(is_missing)]
        if len(missing):
            markers = sorted({repr(v) for v in missing})[:4]
            found.append(
                Finding(
                    "",
                    "missing_values",
                    [table.name],
                    [str(column)],
                    f"{len(missing)} of {len(values)} values in '{column}' are missing "
                    f"(markers: {', '.join(markers)}).",
                    len(missing),
                    markers,
                )
            )
        present = _present(values)
        codes = {CURRENCY_CODE.get(m, m.upper()) for v in present for m in CURRENCY.findall(v)}
        if len(codes) > 1:
            found.append(
                Finding(
                    "",
                    "mixed_currency",
                    [table.name],
                    [str(column)],
                    f"'{column}' mixes currencies {sorted(codes)} in one column.",
                    len(present),
                    present.drop_duplicates().head(4).tolist(),
                )
            )
        if "currency" in str(column).lower() and present.str.upper().nunique() > 1:
            numeric = [
                str(c)
                for c in raw.columns
                if c != column
                and pd.to_numeric(_present(raw[c]), errors="coerce").notna().mean() > 0.8
            ]
            found.append(
                Finding(
                    "",
                    "mixed_currency",
                    [table.name],
                    [str(column), *numeric],
                    f"'{column}' holds several currencies "
                    f"{sorted(present.str.upper().unique())[:5]}; amounts in "
                    f"{numeric} are not in one unit.",
                    len(present),
                )
            )

    for column in date_columns(table):
        values = _present(raw[column]).str.strip()
        slash = values[values.str.match(SLASH_DATE)]
        parts = slash.str.extract(SLASH_DATE).astype(int)
        ambiguous = slash[(parts[0] <= 12) & (parts[1] <= 12) & (parts[0] != parts[1])]
        mixed = bool(len(slash)) and bool(values.str.match(ISO_DATE).any())
        if len(ambiguous) or mixed:
            message = f"'{column}' has {len(ambiguous)} date(s) readable as both DD/MM and MM/DD"
            if mixed:
                message += f"; it also mixes ISO and slash formats ({len(slash)} slash dates)"
            found.append(
                Finding(
                    "",
                    "ambiguous_dates",
                    [table.name],
                    [str(column)],
                    message + ".",
                    len(ambiguous),
                    ambiguous.head(4).tolist(),
                )
            )
    return found


def _contradictions(tables: list[Table]) -> list[Finding]:
    found: list[Finding] = []
    for left, right in combinations(tables, 2):
        lcols = {str(c).lower(): c for c in left.raw.columns}
        rcols = {str(c).lower(): c for c in right.raw.columns}
        shared = lcols.keys() & rcols.keys()
        keys = [c for c in shared if c.endswith("id")]
        for key in keys:
            for other in sorted(shared - set(keys)):

                def mapping(t: Table, k: str, o: str) -> dict[str, set[str]]:
                    frame = t.raw[[k, o]].map(lambda v: v.strip().lower())
                    frame = frame[~frame[o].map(is_missing)]
                    return {str(key): set(v) for key, v in frame.groupby(k)[o].agg(set).items()}

                lmap = mapping(left, lcols[key], lcols[other])
                rmap = mapping(right, rcols[key], rcols[other])
                conflicts = sorted(k for k in lmap.keys() & rmap.keys() if lmap[k] != rmap[k])
                if conflicts:
                    examples = [
                        f"{k}: {sorted(lmap[k])} vs {sorted(rmap[k])}" for k in conflicts[:4]
                    ]
                    found.append(
                        Finding(
                            "",
                            "contradiction",
                            [left.name, right.name],
                            [str(lcols[other])],
                            f"'{other}' disagrees between {left.name} and {right.name} for "
                            f"{len(conflicts)} {key} value(s).",
                            len(conflicts),
                            examples,
                        )
                    )
    return found


def scan(tables: list[Table]) -> list[Finding]:
    findings = [f for t in tables for f in _table_findings(t)] + _contradictions(tables)
    for number, finding in enumerate(findings, 1):
        finding.id = f"T{number}"
    return findings


def relevant(findings: list[Finding], code: str, tables: list[Table]) -> list[Finding]:
    """Findings touching a table file and column that the script references."""
    by_name = {t.name: t for t in tables}

    def referenced(name: str) -> bool:
        table = by_name.get(name)
        return (
            table is not None
            and table.file in code
            and (table.sheet is None or table.sheet in code)
        )

    result = []
    for finding in findings:
        uses_table = any(referenced(name) for name in finding.tables)
        uses_column = not finding.columns or any(
            f'"{c}"' in code or f"'{c}'" in code for c in finding.columns
        )
        if uses_table and uses_column:
            result.append(finding)
    return result
