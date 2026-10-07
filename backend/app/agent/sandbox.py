"""Static gate + subprocess runner for LLM-written proof scripts.

ponytail: AST allowlist + isolated subprocess on a temp copy, not a container. Good for a local
demo; run scripts in a locked-down container (no network, read-only FS) before exposing this.
"""

import ast
import json
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.agent.workspace import copy_files

ALLOWED_IMPORTS = {
    "pandas",
    "numpy",
    "json",
    "math",
    "re",
    "datetime",
    "hashlib",
    "pathlib",
    "statistics",
    "decimal",
    "collections",
    "itertools",
    "functools",
}
BANNED_NAMES = {
    "open",
    "eval",
    "exec",
    "compile",
    "__import__",
    "getattr",
    "setattr",
    "delattr",
    "globals",
    "locals",
    "vars",
    "input",
    "breakpoint",
    "exit",
    "quit",
    "help",
    "memoryview",
}
BANNED_ATTRIBUTES = {
    "unlink",
    "rmdir",
    "touch",
    "mkdir",
    "chmod",
    "write_text",
    "write_bytes",
    "system",
    "popen",
    "symlink_to",
    "hardlink_to",
    "to_pickle",
    "read_pickle",
    "read_sql",
    "to_sql",
    "read_html",
    "read_clipboard",
    "to_clipboard",
}
# URLs, ../ traversal, drive letters, absolute paths (/etc, \\server), home (~/)
UNSAFE_STRING = re.compile(r"://|\.\.[\\/]|[\\/]\.\.|^[A-Za-z]:[\\/]|^[\\/][\w\\/.~]|^~")


@dataclass
class RunResult:
    ok: bool
    value: object = None
    error: str = ""
    stdout: str = ""


def gate(code: str) -> str | None:
    """Return a reason the script is rejected, or None if it may run."""
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return f"SyntaxError: {exc.msg} (line {exc.lineno})"
    for node in ast.walk(tree):
        if isinstance(node, ast.Import | ast.ImportFrom):
            modules = (
                [a.name for a in node.names]
                if isinstance(node, ast.Import)
                else [node.module or ""]
            )
            for module in modules:
                if module.split(".")[0] not in ALLOWED_IMPORTS:
                    return f"import of '{module}' is not allowed"
        elif isinstance(node, ast.Name) and node.id in BANNED_NAMES:
            return f"use of '{node.id}' is not allowed"
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("__") or node.attr in BANNED_ATTRIBUTES:
                return f"attribute '{node.attr}' is not allowed"
            if node.attr.startswith("to_") and node.attr not in {
                "to_numeric",
                "to_datetime",
                "to_dict",
                "to_list",
                "to_numpy",
                "to_period",
                "to_timestamp",
                "to_frame",
                "to_string",
                "to_pydatetime",
                "to_records",
            }:
                return f"writing output via '{node.attr}' is not allowed"
        elif (
            isinstance(node, ast.Constant)
            and isinstance(node.value, str)
            and UNSAFE_STRING.search(node.value)
        ):
            return f"string {node.value[:40]!r} looks like a URL or path outside the workspace"
    return None


HEADER = """# ProofLens proof script — re-run with:  python {script}   (from the data folder)
# Question: {question}
# Interpretation: {label}
{assumptions}
import hashlib as _hashlib
import json as _json
import pathlib as _pathlib

_INPUTS = {hashes}
for _name, _digest in _INPUTS.items():
    assert _hashlib.sha256(_pathlib.Path(_name).read_bytes()).hexdigest() == _digest, (
        f"{{_name}} changed since this proof was made; the answer no longer applies"
    )
"""

# Deterministic cleaning helpers, inlined so every proof stays standalone and auditable.
HELPERS = r'''
# ---- cleaning helpers (trusted, deterministic) ----
import numpy as np
import pandas as pd
import pandas as _pd

_MISSING = {"", "na", "n/a", "null", "none", "nan", "-", "--", "error", "unknown", "#n/a"}
_SYMBOLS = {"$": "USD", "€": "EUR", "£": "GBP", "₹": "INR", "¥": "JPY"}


def is_missing(series):
    """True where a cell is empty or a missing marker (NA, N/A, null, -, ERROR, UNKNOWN)."""
    return series.isna() | series.astype(str).str.strip().str.lower().isin(_MISSING)


def _text(series):
    return series.astype(object).where(~is_missing(series), "").astype(str).str.strip()


def parse_money(series):
    """Returns (amount, currency): float amounts and ISO codes such as 'USD' or 'EUR'.
    Missing cells give NaN amount; a value without a marker gives currency None."""
    text = _text(series)
    marker = text.str.extract(r"([$€£₹¥]|[A-Z]{3})", expand=False)
    currency = marker.map(lambda m: _SYMBOLS.get(m, m) if isinstance(m, str) else None)
    amount = _pd.to_numeric(text.str.replace(r"[^0-9.\-]", "", regex=True), errors="coerce")
    return amount.astype(float), currency


def parse_dates(series, slash_order="DMY"):
    """ISO dates (2024-03-05) parse exactly. Slash dates (05/03/2024) are ambiguous: they are
    read as day/month ("DMY") or month/day ("MDY") - an explicit, stated assumption."""
    text = _text(series)
    iso = _pd.to_datetime(text.str[:10].where(text.str.match(r"^\d{4}-\d{1,2}-\d{1,2}")),
                          format="%Y-%m-%d", errors="coerce")
    slash = text.str.replace(r"[.\-]", "/", regex=True).where(
        text.str.match(r"^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}$"))
    fmt = "%d/%m/%Y" if slash_order == "DMY" else "%m/%d/%Y"
    return iso.fillna(_pd.to_datetime(slash, format=fmt, errors="coerce"))


def replace_from(table, source, key, column):
    """Copy of `table` whose `column` is taken from the authoritative `source` table, matched
    on `key`. Use it when two tables disagree and a document names `source` as authoritative."""
    lookup = source.drop_duplicates(subset=[key]).set_index(key)[column]
    out = table.copy()
    out[column] = out[key].map(lookup)
    return out


# ---- analysis (agent-written) ----
'''

FOOTER = """
# ---- result (trusted) ----
def _plain(value):
    if hasattr(value, "item") and not hasattr(value, "__len__"):
        return value.item()
    if hasattr(value, "to_dict"):
        value = value.to_dict()
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    if isinstance(value, float) and value != value:
        return None
    return value

_answer = _plain(result)
if isinstance(_answer, dict) and len(_answer) == 1:
    _answer = list(_answer.values())[0]
if _answer is None or _answer == {} or _answer == []:
    raise ValueError("`result` is empty or NaN - the computation selected no usable rows")
print("PROOFLENS_RESULT=" + _json.dumps({"answer": _answer}, default=str))
"""


def build_script(
    code: str,
    question: str,
    label: str,
    assumptions: list[str],
    hashes: dict[str, str],
    script: str = "proof.py",
) -> str:
    notes = "\n".join(f"# Assumption: {a}" for a in assumptions) or "# Assumption: none"
    header = HEADER.format(
        script=script,
        question=question.replace("\n", " "),
        label=label.replace("\n", " "),
        assumptions=notes,
        hashes=json.dumps(hashes, indent=4),
    )
    return header + HELPERS + code.strip() + "\n" + FOOTER


def run(script: str, workspace: Path, timeout: float) -> RunResult:
    reason = gate(script)
    if reason:
        return RunResult(False, error=f"Rejected by safety gate: {reason}")
    with tempfile.TemporaryDirectory(prefix="prooflens-") as tmp:
        copy_files(workspace, Path(tmp))
        (Path(tmp) / "proof.py").write_text(script, encoding="utf-8")
        try:
            done = subprocess.run(  # noqa: S603 - fixed interpreter, gated script
                [sys.executable, "-I", "proof.py"],
                cwd=tmp,
                capture_output=True,
                text=True,
                timeout=timeout,
                env={"PYTHONIOENCODING": "utf-8", "SYSTEMROOT": _systemroot()},
            )
        except subprocess.TimeoutExpired:
            return RunResult(False, error=f"Script exceeded the {timeout:.0f}s time limit.")
    marker = next(
        (line for line in done.stdout.splitlines() if line.startswith("PROOFLENS_RESULT=")), None
    )
    if done.returncode != 0 or marker is None:
        return RunResult(
            False, error=explain_error(script, done.stderr), stdout=done.stdout[-2000:]
        )
    value = json.loads(marker.removeprefix("PROOFLENS_RESULT="))["answer"]
    return RunResult(True, value=value, stdout=done.stdout[-2000:])


def explain_error(script: str, stderr: str) -> str:
    """Last exception line plus the failing line of the agent's own code."""
    lines = (stderr or "").strip().splitlines()
    message = lines[-1] if lines else "the script did not print a result"
    script_lines = script.splitlines()
    start = next((n for n, line in enumerate(script_lines, 1) if "agent-written" in line), 0)
    frames = re.findall(r'proof\.py", line (\d+)', stderr or "")
    if not frames:
        return message
    number = int(frames[-1])
    source = script_lines[number - 1].strip() if number <= len(script_lines) else "?"
    where = number - start
    return f"{message}\n  at line {where} of your code: {source}" if where > 0 else message


def _systemroot() -> str:
    import os

    return os.environ.get("SYSTEMROOT", "")


def same(a: object, b: object, rel: float = 1e-6) -> bool:
    if isinstance(a, int | float) and isinstance(b, int | float):
        return abs(a - b) <= rel * max(1.0, abs(a), abs(b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k], rel) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y, rel) for x, y in zip(a, b, strict=True))
    if isinstance(a, str) and isinstance(b, str):
        return a.strip().lower() == b.strip().lower()
    return a == b
