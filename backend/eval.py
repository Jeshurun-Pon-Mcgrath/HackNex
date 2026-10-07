"""Score the agent on the demo trap suite: python eval.py [--only N] [--model qwen3:8b]

Prints, per question: expected vs actual outcome, value check, and whether every proof script
re-runs to the same value in a fresh process.
"""

import argparse
import json
import shutil
import time
from pathlib import Path

from app.agent import sandbox, workspace
from app.agent.llm import LLM
from app.agent.pipeline import Agent
from app.core.config import get_settings

ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "demo"


def correct(item: dict[str, object], run: dict[str, object]) -> bool:
    expect, status = item["expect"], run["status"]
    if expect == "refuse":
        return status == "refused"
    if expect == "ambiguous":  # spotting it (matrix) or refusing with a reason both count
        return status in {"ambiguous", "refused"}
    if status != "answered":
        return False
    return sandbox.same(item["value"], run["answer"], rel=0.005)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", type=int, nargs="*", help="1-based question numbers")
    parser.add_argument("--model")
    args = parser.parse_args()
    settings = get_settings()
    questions = json.loads((DEMO / "questions.json").read_text(encoding="utf-8"))
    workspace_id = workspace.create(settings.data_dir)
    path = settings.data_dir / "workspaces" / workspace_id
    for name in ("orders.csv", "customers.xlsx", "policy.md"):
        shutil.copy(DEMO / name, path / name)
    ws = workspace.load(settings.data_dir, workspace_id)
    agent = Agent(
        LLM(settings.ollama_url, args.model or settings.ollama_model, settings.llm_timeout_seconds),
        settings.script_timeout_seconds,
    )

    score = rerun_ok = rerun_total = 0
    selected = [(n, q) for n, q in enumerate(questions, 1) if not args.only or n in args.only]
    for number, item in selected:
        started = time.time()
        run = next(e["run"] for e in agent.ask(ws, item["q"]) if e["type"] == "result")
        for interp in run["interpretations"]:
            if interp.get("ok"):
                rerun_total += 1
                again = sandbox.run(interp["script"], ws.path, settings.script_timeout_seconds)
                rerun_ok += again.ok and sandbox.same(interp["value"], again.value)
        ok = correct(item, run)
        score += ok
        got = (
            run.get("display")
            or (run.get("refusal") or {}).get("code")
            or [i.get("display") for i in run["interpretations"]]
        )
        print(
            f"{'PASS' if ok else 'FAIL'} Q{number:<2} {item['q'][:55]:<55} expect="
            f"{item['expect']}:{item.get('value', '')} got={run['status']}:{got} "
            f"L{run['strength']['level']} ({time.time() - started:.0f}s)",
            flush=True,
        )
    print(
        f"\nscore {score}/{len(selected)} | proof re-run success {rerun_ok}/{rerun_total} | "
        f"workspace {workspace_id}"
    )


if __name__ == "__main__":
    main()
