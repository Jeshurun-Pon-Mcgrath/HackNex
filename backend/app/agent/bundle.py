"""Judge kit: data + proof scripts + claims + a stdlib verifier, as one zip."""

import io
import json
import zipfile
from pathlib import Path
from typing import Any

from app.agent.workspace import data_files

VERIFY_ALL = '''"""Re-run every ProofLens proof script and compare with the claimed answer.

Usage (needs pandas + openpyxl):  python verify_all.py
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def same(a, b, rel=1e-6):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) <= rel * max(1.0, abs(a), abs(b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k], rel) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y, rel) for x, y in zip(a, b))
    if isinstance(a, str) and isinstance(b, str):
        return a.strip().lower() == b.strip().lower()
    return a == b


claims = json.loads((ROOT / "claims.json").read_text(encoding="utf-8"))
passed = failed = 0
for claim in claims:
    if claim["status"] == "refused":
        print(f"REFUSED  {claim['question']}\\n         reason: {claim['refusal']['reason']}")
        continue
    done = subprocess.run([sys.executable, claim["script"]], cwd=ROOT, capture_output=True,
                          text=True, encoding="utf-8")
    line = next((l for l in done.stdout.splitlines() if l.startswith("PROOFLENS_RESULT=")), None)
    value = json.loads(line.split("=", 1)[1])["answer"] if line else None
    ok = line is not None and same(claim["claimed"], value)
    passed += ok
    failed += not ok
    print(f"{'PASS' if ok else 'FAIL'}     {claim['question']}  [{claim['interpretation']}]")
    print(f"         claimed={claim['claimed']!r} reproduced={value!r}")
    if not ok and done.stderr:
        print("         " + done.stderr.strip().splitlines()[-1])
print(f"\\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
'''

README = """# ProofLens proof kit

Every number ProofLens reported is backed by a standalone script in `proofs/`.

    pip install pandas openpyxl
    python verify_all.py          # re-runs every proof, prints PASS/FAIL per claim

Run a single proof yourself from this folder: `python proofs/<run>_<n>.py`.
Each script asserts the SHA-256 of its input files first, so it refuses to run on changed data.
`claims.json` lists every question, its status (answered / ambiguous / refused), the
assumptions behind each interpretation, and the claimed value.
"""


def build(path: Path, runs: list[dict[str, Any]]) -> bytes:
    buffer = io.BytesIO()
    claims: list[dict[str, Any]] = []
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for file in data_files(path):
            archive.write(file, file.name)
        for run in reversed(runs):
            if run["status"] == "refused":
                claims.append(
                    {
                        "question": run["question"],
                        "status": "refused",
                        "refusal": run.get("refusal"),
                    }
                )
                continue
            for interp in run["interpretations"]:
                if not interp.get("ok"):
                    continue
                if run.get("adopted") and interp["index"] != run["adopted"]:
                    continue
                script = f"proofs/{run['id']}_{interp['index']}.py"
                archive.writestr(script, interp["script"])
                claims.append(
                    {
                        "question": run["question"],
                        "status": run["status"],
                        "script": script,
                        "interpretation": interp["label"],
                        "assumptions": interp["assumptions"],
                        "claimed": interp["value"],
                        "display": interp.get("display", ""),
                    }
                )
        archive.writestr("claims.json", json.dumps(claims, indent=2, default=str))
        archive.writestr("verify_all.py", VERIFY_ALL)
        archive.writestr("README.md", README)
    return buffer.getvalue()
