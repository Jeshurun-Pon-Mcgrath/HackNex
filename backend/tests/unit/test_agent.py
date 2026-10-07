import io
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

from app.agent import bundle, premises, sandbox, workspace
from app.agent.pipeline import firewall, lint, text_for_number
from app.agent.scan import is_missing as scan_is_missing
from app.agent.scan import scan

DEMO = Path(__file__).resolve().parents[3] / "demo"


@pytest.fixture
def demo(tmp_path: Path) -> workspace.Workspace:
    workspace_id = workspace.create(tmp_path)
    for name in ("orders.csv", "customers.xlsx", "policy.md"):
        shutil.copy(DEMO / name, tmp_path / "workspaces" / workspace_id / name)
    return workspace.load(tmp_path, workspace_id)


def test_scan_finds_every_planted_trap(demo: workspace.Workspace) -> None:
    kinds = {(f.kind, tuple(f.columns)) for f in scan(demo.tables)}
    assert ("duplicate_rows", ()) in kinds
    assert ("missing_values", ("amount",)) in kinds
    assert ("mixed_currency", ("amount",)) in kinds
    assert ("ambiguous_dates", ("order_date",)) in kinds
    assert ("contradiction", ("region",)) in kinds


@pytest.mark.parametrize(
    "code",
    [
        "import os\nresult = 1",
        "import subprocess\nresult = 1",
        "result = open('orders.csv').read()",
        "import pandas as pd\nresult = pd.read_csv('https://evil.example/x.csv')",
        "import pandas as pd\nresult = pd.read_csv('C:/Windows/win.ini')",
        "import pandas as pd\nresult = pd.read_csv('../secret.csv')",
        "result = ().__class__.__bases__",
        "result = eval('1')",
        "import pandas as pd\npd.DataFrame().to_csv('x.csv')\nresult = 1",
    ],
)
def test_gate_rejects_unsafe_code(code: str) -> None:
    assert sandbox.gate(code) is not None


def test_proof_script_runs_reproduces_and_pins_hashes(demo: workspace.Workspace) -> None:
    code = 'import pandas as pd\nresult = len(pd.read_csv("orders.csv").drop_duplicates())'
    script = sandbox.build_script(code, "How many orders?", "default", [], demo.hashes)
    first = sandbox.run(script, demo.path, 30)
    assert first.ok and first.value == 30
    assert sandbox.same(first.value, sandbox.run(script, demo.path, 30).value)
    tampered = sandbox.build_script(code, "q", "l", [], {**demo.hashes, "orders.csv": "0" * 64})
    assert "changed since this proof" in sandbox.run(tampered, demo.path, 30).error


def test_failing_line_is_reported_in_agent_coordinates(demo: workspace.Workspace) -> None:
    script = sandbox.build_script("x = 1\nresult = x / 0", "q", "l", [], demo.hashes)
    error = sandbox.run(script, demo.path, 30).error
    assert "ZeroDivisionError" in error and "line 2 of your code" in error


def test_number_firewall_allows_only_sourced_numbers() -> None:
    docs = {"policy.md": "1 EUR = 1.10 USD"}
    assert firewall("Revenue is {{answer}} after converting at 1.10.", "total?", docs) == []
    assert firewall("Revenue is 3,894 USD.", "total?", docs) == ["3,894"]
    assert firewall("Orders in {{ answer }} for 2024.", "orders in 2024?", docs) == []


def test_premise_audit(demo: workspace.Workspace) -> None:
    assert not premises.check(demo, {"kind": "date", "value": "2024-02-30"})[0]
    assert not premises.check(demo, {"kind": "period", "value": "2023"})[0]
    assert premises.check(demo, {"kind": "period", "value": "2024-03"})[0]
    assert not premises.check(demo, {"kind": "column", "column": "profit"})[0]
    assert premises.check(demo, {"kind": "column", "column": "Amount"})[0]
    assert premises.check(demo, {"kind": "value", "value": "Widget"})[0]
    assert not premises.check(demo, {"kind": "value", "value": "Antarctica"})[0]
    q = "How many Widgets were sold?"
    assert premises.entities(demo, q, ["Widgets", "quantity", "C01"]) == {"Widget"}


def test_bundle_verify_all_passes(demo: workspace.Workspace, tmp_path: Path) -> None:
    code = (
        "import pandas as pd\n"
        'result = pd.read_csv("orders.csv").drop_duplicates().groupby("product")["quantity"].sum()'
    )
    script = sandbox.build_script(code, "Units by product?", "default", [], demo.hashes)
    value = sandbox.run(script, demo.path, 30).value
    runs = [
        {
            "id": "r1",
            "question": "Units by product?",
            "status": "answered",
            "interpretations": [
                {
                    "index": 1,
                    "label": "default",
                    "assumptions": [],
                    "ok": True,
                    "value": value,
                    "script": script,
                }
            ],
        },
        {
            "id": "r2",
            "question": "Revenue on Feb 30?",
            "status": "refused",
            "refusal": {"code": "false_premise", "reason": "not a date"},
            "interpretations": [],
        },
    ]
    out = tmp_path / "kit"
    zipfile.ZipFile(io.BytesIO(bundle.build(demo.path, runs))).extractall(out)
    done = subprocess.run(
        [sys.executable, "verify_all.py"],
        cwd=out,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert done.returncode == 0, done.stdout + done.stderr
    assert "1 passed, 0 failed" in done.stdout


def test_lint_flags_silent_pandas_mistakes() -> None:
    bad = 'usd = np.where(c == "EUR", a * 1.1, a)\ndf = df[~is_missing(df["amount"])]'
    good = 'df["usd"] = np.where(c == "EUR", a * 1.1, a)\nn = is_missing(df["amount"]).sum()'
    assert len(lint(bad)) == 2
    assert lint(good) == []
    assert lint('value, currency = parse_money(df["Total Spent"])')
    assert lint('day = parse_dates(df["d"], "DMY")')
    assert not lint('df["value"], df["currency"] = parse_money(df["Total Spent"])')
    assert lint('n = df["amount"].is_missing().sum()')
    eur_avg = 'result = df[df["currency"] == "EUR"]["usd"].mean()'
    assert lint(eur_avg, "EUR") and not lint(eur_avg, "USD")


def test_text_result_is_not_a_number() -> None:
    joined = "16.08.020.0ERROR4.0"  # what .sum() gives on a text column
    assert text_for_number(joined, "What was the total spent on Sandwiches?", "")
    assert text_for_number("12.5", "What was the total spent?", "USD")
    assert not text_for_number("West", "Which region sold most?", "USD")
    assert not text_for_number(42.0, "What was the total spent?", "USD")


def test_error_and_unknown_count_as_missing(tmp_path: Path) -> None:
    assert scan_is_missing("ERROR") and scan_is_missing(" unknown ")
    code = 'result = int(is_missing(pd.Series(["ERROR", "UNKNOWN", "4.0"])).sum())'
    ran = sandbox.run(sandbox.build_script(code, "q", "l", [], {}), tmp_path, 20)
    assert ran.ok and ran.value == 2
