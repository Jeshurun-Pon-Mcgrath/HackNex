"""The agent: Premise Audit -> plan interpretations -> sandboxed proofs -> verdict.

Every number shown to a user comes from a proof script's printed output (Number Firewall).
"""

import json
import re
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.agent import premises as premise_audit
from app.agent import sandbox
from app.agent.llm import LLM
from app.agent.scan import Finding, relevant, scan
from app.agent.workspace import Workspace

Event = dict[str, Any]
# Code patterns small models get wrong silently; each match triggers a re-plan with this advice.
LINTS = [
    (
        re.compile(
            r"^\s*\w+(\s*,\s*\w+)*\s*=\s*(np\.where|parse_money|parse_dates)\(", re.MULTILINE
        ),
        "You assigned np.where/parse_money/parse_dates output to plain variables, so later "
        "row filters do not apply to them and the result covers every row. Store them as "
        'columns: df["value"], df["currency"] = parse_money(df[col]); '
        'df["usd"] = np.where(...); then filter df and aggregate its column.',
    ),
    (
        re.compile(r"\[\s*~\s*is_missing\("),
        "You dropped rows with a missing value. That loses rows whose other columns are valid; "
        "NaN is already skipped by sum/mean. Remove that filter.",
    ),
    (
        re.compile(r"\.(is_missing|parse_money|parse_dates|replace_from)\("),
        "Helpers are plain functions, not methods: is_missing(df[col]), not df[col].is_missing().",
    ),
]
WHICH = re.compile(r"^\s*(which|who)\b", re.IGNORECASE)
CURRENCIES = {"usd", "eur", "gbp", "inr", "jpy"}
# "16.08.020.0": what .sum() gives on a text column - never a valid answer.
CONCATENATED = re.compile(r"\d\.\d+\.\d")


def text_for_number(value: object, question: str, unit: str) -> bool:
    """A text result where the question needs a number (a money unit, or joined-up numbers)."""
    if not isinstance(value, str) or WHICH.match(question):
        return False
    return unit.strip().lower() in CURRENCIES or bool(CONCATENATED.search(value))


RESULT_COLUMNS = re.compile(r"""^\s*result\s*=.*""", re.MULTILINE)


def lint(code: str, unit: str = "") -> list[str]:
    problems = [advice for pattern, advice in LINTS if pattern.search(code)]
    unit = unit.strip().lower()
    if unit in CURRENCIES:
        # $/€ trap: the answer is labelled in one currency but aggregates another's column
        used = {
            c
            for line in RESULT_COLUMNS.findall(code)
            for c in re.findall(r"""\[\s*["'](\w+)["']\s*\]""", line.lower())
        }
        wrong = sorted(used & CURRENCIES - {unit})
        if wrong:
            problems.append(
                f"The answer unit is {unit.upper()} but `result` aggregates the {wrong} column. "
                f"Aggregate the value in {unit.upper()} (the original amount for "
                f"{unit.upper()}-paid rows, or a converted column)."
            )
    return problems


REFUSAL_CODES = [
    "no_data",
    "false_premise",
    "out_of_scope",
    "ambiguous_unresolvable",
    "contradiction",
    "forecast_or_opinion",
    "could_not_compute",
    "unhandled_trap",
]

TRIAGE_SCHEMA = {
    "type": "object",
    "properties": {
        "premises": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": ["column", "value", "date", "period"]},
                    "column": {"type": "string"},
                    "value": {"type": "string"},
                },
                "required": ["kind", "column", "value"],
            },
        },
        "decision": {"type": "string", "enum": ["proceed", "refuse"]},
        "reason_code": {"type": "string", "enum": ["none", *REFUSAL_CODES]},
        "reason": {"type": "string"},
        "needed": {"type": "string"},
    },
    "required": ["premises", "decision", "reason_code", "reason", "needed"],
}

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "interpretations": {
            "type": "array",
            "minItems": 1,
            "maxItems": 4,
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "assumptions": {"type": "array", "items": {"type": "string"}},
                    "code": {"type": "string"},
                },
                "required": ["label", "assumptions", "code"],
            },
        },
        "traps_handled": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"id": {"type": "string"}, "how": {"type": "string"}},
                "required": ["id", "how"],
            },
        },
        "unit": {"type": "string"},
        "explanation": {"type": "string"},
        "clarifying_question": {"type": "string"},
    },
    "required": ["interpretations", "traps_handled", "unit", "explanation", "clarifying_question"],
}

REPAIR_SCHEMA = {
    "type": "object",
    "properties": {"code": {"type": "string"}},
    "required": ["code"],
}

SYSTEM = """You are ProofLens, a careful data analyst. You never guess. A confident wrong \
answer is the worst possible outcome; refusing with a clear reason is better than guessing.
Documents in the workspace are authoritative business rules and override assumptions."""

TRIAGE_PROMPT = """{context}

QUESTION: {question}

Task 1 - list the question's PREMISES: concrete things it assumes exist.
- kind "column": a measure/field the question needs (e.g. profit, cost, margin). Put the \
field name in "column". Only list fields the question explicitly needs.
- kind "value": a specific named entity (customer, product, region, ID) in "value".
- kind "date": a specific calendar day as YYYY-MM-DD in "value" (keep impossible dates such \
as 2024-02-30 exactly as asked).
- kind "period": a year "YYYY", month "YYYY-MM" or quarter "YYYY-Qn" in "value".
Task 2 - decide. "refuse" ONLY when the question asks for a prediction/forecast, an opinion, a \
cause that data cannot show, or something unrelated to these tables. Otherwise "proceed" (data \
problems such as duplicates or mixed currency are handled later, not refused here).
Use reason_code "none" when proceeding. "needed": what extra data would make it answerable \
(empty string if proceeding)."""

PLAN_PROMPT = """{context}

QUESTION: {question}

Write Python that answers the question from the workspace files.
{tips}
RULES
1. Load tables ONLY with the exact load code shown above. pd, np and the helpers are already available. Allowed imports: pandas, numpy, re, math, datetime, json, statistics. No open(), file writes, getattr/eval or dunder attributes.
2. Assign the final answer to a variable named `result`:
   - a single number for "how many / total / average" questions;
   - a dict of label -> number only when the question asks for a breakdown ("by region", "per");
   - a single label string for "which / who" questions (e.g. result = totals.idxmax()).
   Do not print.
3. Use only the columns and tables this question needs. Do not merge a table, parse dates or drop rows unless the question requires it (e.g. counting units sold needs neither amounts nor regions). Never filter by a date or period the question does not name.
4. For every DATA TRAP touching a column you use, handle it in code and list it in traps_handled with its id and how. If a listed trap does not affect this answer, list it with how = "not relevant: <reason>". traps_handled is a JSON field; never write it inside the code.
5. Use rates, rules and definitions from DOCUMENTS (they override assumptions). Never invent a number that is not in the data, the documents or the question.
6. INTERPRETATIONS: give exactly ONE unless the answer depends on a choice no document resolves (e.g. ambiguous slash dates when the question filters by date or month). Then give one complete script per reading (2-4), differing only in that choice (e.g. parse_dates(s, "DMY") vs parse_dates(s, "MDY")), a short label naming the choice, and a clarifying_question.
7. explanation: one or two sentences describing the method. It MUST NOT contain digits; refer to the result as {{{{answer}}}} (e.g. "Total revenue is {{{{answer}}}} after removing duplicate orders and converting EUR at the policy rate.").
8. unit: e.g. "USD", "EUR", "orders", "units", or "" for text answers.
{feedback}"""

PANDAS_TIPS = r"""
HELPERS (already defined in every script; they take a whole column, never use them with .apply):
- is_missing(series) -> bool Series. True for empty cells and markers NA, N/A, null, -, ERROR, UNKNOWN.
- parse_money(series) -> (amount, currency). amount: float Series ("$1,200.50" -> 1200.5, missing -> NaN); currency: "USD"/"EUR"/"GBP" per row from the symbol or code.
- parse_dates(series, slash_order="DMY" or "MDY") -> datetime Series. ISO dates are exact; slash dates like 05/03/2024 follow slash_order.
- replace_from(table, source, key, column) -> copy of table whose column comes from the authoritative source table (matched on key). No merge needed.

STANDARD FIX PER TRAP KIND (apply only if the question uses that column):
- duplicate_rows: df = df.drop_duplicates()
- mixed_currency: df["value"], df["currency"] = parse_money(df["amount"]) (value is in the row's own currency); df["usd"] = np.where(df["currency"] == "EUR", df["value"] * RATE, df["value"]) with RATE from the documents. Answer in the unit the question asks: e.g. for EUR-paid orders in EUR, use df[df["currency"] == "EUR"]["value"].
- missing_values: parse_money/parse_dates turn missing cells into NaN, which .sum()/.mean() skip; count them with is_missing(df[col]).sum(). Do NOT drop rows for a missing value in a column the answer does not aggregate: a row with no amount still has a valid quantity, product and date.
- ambiguous_dates: only matters if the question filters or groups by date: one interpretation with parse_dates(s, "DMY") and one with parse_dates(s, "MDY").
- contradiction: only matters if the question uses that column: df = replace_from(df, authoritative_table, key, column), choosing the source named by the documents.
GENERIC EXAMPLE (names differ in your data; USD total per authoritative territory):
sales = pd.read_csv("sales.csv").drop_duplicates()
accounts = pd.read_excel("crm.xlsx", sheet_name="Accounts")
sales = replace_from(sales, accounts, "account_id", "territory")
sales["value"], sales["currency"] = parse_money(sales["price"])
sales["usd"] = np.where(sales["currency"] == "EUR", sales["value"] * RATE_FROM_DOCUMENT, sales["value"])
result = sales.groupby("territory")["usd"].sum().to_dict()
NOTES: A column whose dtype is object/str holds TEXT even if it looks numeric (e.g. it contains ERROR); .sum() on it joins strings. Convert before any arithmetic: df["value"], _ = parse_money(df[col]) or pd.to_numeric(df[col], errors="coerce"). Store every derived value (usd, date, currency) as a NEW COLUMN of the dataframe, then filter the dataframe, then aggregate the column. A separate variable/array is NOT filtered and silently gives the unfiltered total. Table names like "file.xlsx[Sheet]" are labels, not Python variables. "units sold" means summing a quantity column, not counting rows. Use the exact column names shown above.
"""

REPAIR_PROMPT = """{context}

QUESTION: {question}
Interpretation: {label}

This script failed:
```python
{code}
```
Error:
{error}

Return the corrected full script. Helpers is_missing, parse_money, parse_dates, replace_from are plain functions taking a column (is_missing(df[col]), never df[col].is_missing()). Same rules: load tables with the given load code, assign `result`, do not print. Allowed imports: pandas, numpy, re, math, datetime, json, statistics; no open(), file writes, getattr/eval or dunder attributes."""


def context_block(ws: Workspace, findings: list[Finding]) -> str:
    lines = ["TABLES (working directory contains these files):"]
    for t in ws.tables:
        lines.append(f"- {t.name}: {len(t.raw)} rows. Load with: {t.load}")
        for column in t.raw.columns:
            examples = t.raw[column].drop_duplicates().head(4).tolist()
            lines.append(f"    {column} ({t.dtypes.get(column, '?')}) e.g. {examples}")
    if ws.documents:
        lines.append("DOCUMENTS:")
        for name, text in ws.documents.items():
            lines.append(f"=== {name} ===\n{text.strip()}")
    span = premise_audit.data_date_range(ws)
    if span:
        lines.append(f"DATA DATE RANGE: {span[0]} to {span[1]}")
    lines.append("DATA TRAPS (verified by a scanner):")
    lines.extend(
        f"- {f.id} [{f.kind}] {', '.join(f.tables)}: {f.message} Examples: {f.examples[:3]}"
        for f in findings
    )
    if not findings:
        lines.append("- none")
    return "\n".join(lines)


NUMBER = re.compile(r"\d+(?:[.,]\d+)?")
PLACEHOLDER = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")


def firewall(text: str, question: str, documents: dict[str, str]) -> list[str]:
    """Digits the model typed that no source (question/documents) contains."""
    sources = question + " " + " ".join(documents.values())
    stripped = PLACEHOLDER.sub("", text)
    return [n for n in NUMBER.findall(stripped) if n not in sources]


def display(value: object, unit: str) -> str:
    if isinstance(value, bool) or value is None:
        return str(value)
    if isinstance(value, float):
        text = f"{value:,.2f}"
    elif isinstance(value, int):
        text = f"{value:,}"
    elif isinstance(value, dict):
        return "; ".join(f"{k}: {display(v, unit)}" for k, v in value.items())
    else:
        text = str(value)
    return f"{text} {unit}".strip() if unit and not isinstance(value, str) else text


def fill(template: str, values: dict[str, str], unit: str = "") -> str:
    text = PLACEHOLDER.sub(lambda m: values.get(m[1], "[unavailable]"), template)
    return text.replace(f"{unit} {unit}", unit) if unit else text


class Agent:
    def __init__(self, llm: LLM, script_timeout: float) -> None:
        self.llm = llm
        self.timeout = script_timeout

    def ask(self, ws: Workspace, question: str) -> Iterator[Event]:
        run: dict[str, Any] = {
            "id": uuid4().hex[:12],
            "question": question,
            "created_at": datetime.now(UTC).isoformat(),
            "model": self.llm.model,
            "hashes": ws.hashes,
            "interpretations": [],
            "premises": [],
            "traps": [],
        }
        findings = scan(ws.tables)
        yield {"type": "scan", "findings": [f.dict() for f in findings]}
        context = context_block(ws, findings)

        # 1. Premise Audit
        triage = self.llm.json(
            SYSTEM, TRIAGE_PROMPT.format(context=context, question=question), TRIAGE_SCHEMA
        )
        checked = []
        for premise in triage.get("premises", [])[:8]:
            ok, detail = premise_audit.check(ws, premise)
            checked.append({**premise, "ok": ok, "detail": detail})
        run["premises"] = checked
        yield {"type": "premises", "premises": checked, "decision": triage.get("decision")}
        failed = [p for p in checked if not p["ok"]]
        if failed:
            yield self._finish(
                ws,
                run,
                refusal={
                    "code": "false_premise"
                    if any(p["kind"] != "column" for p in failed)
                    else "no_data",
                    "reason": "; ".join(p["detail"] for p in failed),
                    "needed": triage.get("needed")
                    or "Data that contains what the question assumes.",
                },
            )
            return
        if triage.get("decision") == "refuse":
            yield self._finish(
                ws,
                run,
                refusal={
                    "code": str(triage.get("reason_code"))
                    if triage.get("reason_code") in REFUSAL_CODES
                    else "out_of_scope",
                    "reason": triage.get("reason") or "The question cannot be answered from data.",
                    "needed": triage.get("needed", ""),
                },
            )
            return

        # 2. Plan interpretations, enforcing trap coverage and the Number Firewall
        named = premise_audit.entities(ws, question, [str(p.get("value", "")) for p in checked])
        feedback = ""
        plan: dict[str, Any] = {}
        uncovered: list[Finding] = []
        for attempt in range(3):
            yield {"type": "plan", "attempt": attempt + 1, "status": "thinking"}
            plan = self.llm.json(
                SYSTEM,
                PLAN_PROMPT.format(
                    context=context, question=question, feedback=feedback, tips=PANDAS_TIPS
                ),
                PLAN_SCHEMA,
            )
            interpretations = plan.get("interpretations") or []
            # "not relevant" is no excuse for a trap on a column the result line aggregates
            result_lines = "\n".join(
                line for i in interpretations for line in RESULT_COLUMNS.findall(i.get("code", ""))
            )
            excused = {
                str(t.get("id", "")).strip()
                for t in plan.get("traps_handled", [])
                if str(t.get("how", "")).strip().lower().startswith("not relevant")
            }
            handled = {str(t.get("id", "")).strip() for t in plan.get("traps_handled", [])} - {
                f.id
                for f in findings
                if f.id in excused
                and any(f'"{c}"' in result_lines or f"'{c}'" in result_lines for c in f.columns)
            }
            touched = {
                f.id: f
                for i in interpretations
                for f in relevant(findings, i.get("code", ""), ws.tables)
            }
            uncovered = [f for fid, f in touched.items() if fid not in handled]
            leaked = firewall(plan.get("explanation", ""), question, ws.documents)
            problems = []
            if not interpretations:
                problems.append("You returned no interpretations.")
            if uncovered:
                problems.append(
                    "Your code uses data affected by these traps but does not "
                    "handle them (or list them as not relevant with a reason): "
                    + "; ".join(f"{f.id} ({f.message})" for f in uncovered)
                )
            unfiltered = sorted(
                e
                for e in named
                if any(e.lower() not in i.get("code", "").lower() for i in interpretations)
            )
            if unfiltered:
                problems.append(
                    f"The question is about {unfiltered} (exact values in the data), but your "
                    "code never filters on them, so it answers about every row. Filter on them."
                )
            problems += sorted(
                {a for i in interpretations for a in lint(i.get("code", ""), plan.get("unit", ""))}
            )
            if leaked:
                problems.append(
                    f"The explanation contains numbers {leaked} that come from no "
                    "source. Use {{answer}} instead of typing numbers."
                )
            yield {
                "type": "plan",
                "attempt": attempt + 1,
                "status": "checked",
                "interpretations": [i.get("label") for i in interpretations],
                "traps_handled": plan.get("traps_handled", []),
                "problems": problems,
            }
            if not problems:
                break
            feedback = "\nFEEDBACK ON YOUR PREVIOUS ATTEMPT (fix all):\n- " + "\n- ".join(problems)
        if uncovered:
            yield self._finish(
                ws,
                run,
                refusal={
                    "code": "unhandled_trap",
                    "reason": "The analysis could not be made robust to: "
                    + "; ".join(f.message for f in uncovered),
                    "needed": "A rule (e.g. in a policy document) for how to treat these issues.",
                },
            )
            return
        if firewall(plan.get("explanation", ""), question, ws.documents):
            plan["explanation"] = "The result is {{answer}}."
        how = {t.get("id"): t.get("how", "") for t in plan.get("traps_handled", [])}
        run["traps"] = [
            {**f.dict(), "how": how.get(f.id, "")}
            for f in findings
            if f.id in how
            or f.id
            in {
                x.id
                for i in plan["interpretations"]
                for x in relevant(findings, i["code"], ws.tables)
            }
        ]
        run["unit"] = plan.get("unit", "")
        run["clarifying_question"] = plan.get("clarifying_question", "")

        # 3. Execute every interpretation as a standalone, hash-pinned proof script
        for index, interp in enumerate(plan["interpretations"][:4], 1):
            yield from self._prove(ws, run, context, question, index, interp)

        yield self._finish(ws, run, explanation=plan.get("explanation", ""))

    def _prove(
        self,
        ws: Workspace,
        run: dict[str, Any],
        context: str,
        question: str,
        index: int,
        interp: dict[str, Any],
    ) -> Iterator[Event]:
        label = interp.get("label") or f"Interpretation {index}"
        assumptions = [a for a in interp.get("assumptions", []) if a]
        code = interp.get("code", "")
        record: dict[str, Any] = {"index": index, "label": label, "assumptions": assumptions}
        for attempt in range(3):
            script = sandbox.build_script(
                code, question, label, assumptions, ws.hashes, f"proofs/{run['id']}_{index}.py"
            )
            reason = sandbox.gate(code)  # line numbers relative to the agent's own code
            result = (
                sandbox.RunResult(False, error=f"Rejected by safety gate: {reason}")
                if reason
                else sandbox.run(script, ws.path, self.timeout)
            )
            if result.ok and isinstance(result.value, dict) and WHICH.match(question):
                result = sandbox.RunResult(
                    False,
                    error="The question asks which/who, but `result` is a breakdown dict. "
                    "Set result to the single label, e.g. result = totals.idxmax().",
                )
            if result.ok and text_for_number(result.value, question, str(run.get("unit", ""))):
                result = sandbox.RunResult(
                    False,
                    error=f"`result` is text ({str(result.value)[:60]!r}), but this question "
                    "needs a number. Summing a text column joins the strings. Convert it first: "
                    'df["value"], _ = parse_money(df[col]) (ERROR/UNKNOWN become NaN), then '
                    "aggregate df['value'].",
                )
            yield {
                "type": "exec",
                "index": index,
                "label": label,
                "attempt": attempt + 1,
                "ok": result.ok,
                "error": result.error,
            }
            if result.ok:
                again = sandbox.run(script, ws.path, self.timeout)
                record.update(
                    script=script,
                    ok=True,
                    value=result.value,
                    deterministic=again.ok and sandbox.same(result.value, again.value),
                )
                break
            record.update(script=script, ok=False, error=result.error)
            if attempt < 2:
                code = self.llm.json(
                    SYSTEM,
                    REPAIR_PROMPT.format(
                        context=context,
                        question=question,
                        label=label,
                        code=code,
                        error=result.error,
                    )
                    + PANDAS_TIPS,
                    REPAIR_SCHEMA,
                ).get("code", code)
        run["interpretations"].append(record)

    def _finish(
        self,
        ws: Workspace,
        run: dict[str, Any],
        *,
        refusal: dict[str, str] | None = None,
        explanation: str = "",
    ) -> Event:
        unit = run.get("unit", "")
        good = [i for i in run["interpretations"] if i.get("ok")]
        if refusal is None and not good:
            errors = "; ".join(i.get("error", "")[-200:] for i in run["interpretations"])
            refusal = {
                "code": "could_not_compute",
                "reason": f"No proof script ran successfully. {errors}",
                "needed": "A simpler question or cleaner data.",
            }
        checks = []
        if refusal:
            run.update(
                status="refused",
                refusal=refusal,
                answer=None,
                display="",
                explanation=refusal["reason"],
            )
        else:
            values = [i["value"] for i in good]
            agree = all(sandbox.same(values[0], v) for v in values[1:])
            for i in good:
                i["display"] = display(i["value"], unit)
            placeholders = {f"interp_{i['index']}.answer": i["display"] for i in good}
            if agree:
                placeholders["answer"] = good[0]["display"]
                run.update(
                    status="answered",
                    answer=values[0],
                    display=good[0]["display"],
                    explanation=fill(explanation, placeholders, unit),
                )
            else:
                placeholders["answer"] = " / ".join(i["display"] for i in good)
                run.update(
                    status="ambiguous",
                    answer=None,
                    display="",
                    explanation=fill(explanation, placeholders, unit),
                )
            checks = [
                {
                    "level": 1,
                    "name": "Proof script runs",
                    "passed": True,
                    "detail": f"{len(good)} of {len(run['interpretations'])} script(s) ran",
                },
                {
                    "level": 2,
                    "name": "Deterministic and hash-pinned",
                    "passed": all(i.get("deterministic") for i in good),
                    "detail": "re-ran in a fresh process with identical output; inputs pinned by "
                    "SHA-256",
                },
                {
                    "level": 3,
                    "name": "Robust to every interpretation",
                    "passed": agree and len(good) == len(run["interpretations"]),
                    "detail": "readings disagree - see the Interpretation Matrix"
                    if not agree
                    else "all readings of the data give the same answer"
                    if len(good) == len(run["interpretations"])
                    else "some readings could not be computed, so robustness is unproven",
                },
            ]
        level = 0
        for check in checks:
            if not check["passed"]:
                break
            level = int(str(check["level"]))
        run["strength"] = {"level": level, "checks": checks}
        save_run(ws.path, run)
        return {"type": "result", "run": run}


def runs_dir(path: Path) -> Path:
    directory = path / "runs"
    directory.mkdir(exist_ok=True)
    return directory


def save_run(path: Path, run: dict[str, Any]) -> None:
    (runs_dir(path) / f"{run['id']}.json").write_text(
        json.dumps(run, default=str, indent=2), encoding="utf-8"
    )


def load_runs(path: Path) -> list[dict[str, Any]]:
    runs = [json.loads(p.read_text(encoding="utf-8")) for p in runs_dir(path).glob("*.json")]
    return sorted(runs, key=lambda r: r["created_at"], reverse=True)
