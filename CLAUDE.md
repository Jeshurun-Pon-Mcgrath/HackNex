# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ProofLens is a HackNex 2026 entry for HNX26PS108, "Proof-Carrying Data Analyst" (agentic GenAI). Users ask questions about messy multi-table data. Every number must come from a re-runnable proof script; otherwise the agent issues a refusal. The judging criteria penalise a confident wrong answer more than a reasoned refusal, so refusing is the safe default whenever the evidence is weak. The LLM is local Ollama (`qwen3:8b` by default, set with `APP_OLLAMA_MODEL`).

## Commands

Backend (`backend/`, Python 3.12 only; the venv is at `backend/.venv`):

    py -3.12 -m venv .venv; .\.venv\Scripts\python -m pip install -e ".[dev]"
    .\.venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 8000   # /docs for Swagger
    ruff check . ; ruff format --check . ; mypy app ; pytest
    pytest tests/unit/test_agent.py::test_premise_audit                # single test
    python eval.py [--only 2 4] [--model qwen3:14b]                    # LLM accuracy on demo/questions.json (needs Ollama)

pytest uses `--basetemp=.pytest_tmp` (set in `pyproject.toml`) because the default Windows temp folder is not writable here.

Frontend (`frontend/`): `npm run dev`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run test -- --run [file] [-t name]`.

Demo data: `python demo/build_demo.py` regenerates `demo/*.csv|xlsx|md` and `questions.json`. The expected answers are computed in the same script.

## Architecture

### Backend (`backend/app`)
- **Workspace storage.** A workspace is a plain directory, `APP_DATA_DIR/workspaces/<32-hex>/`, that holds the uploaded files under their original (sanitised) names, plus `runs/<id>.json`. There is no database. Proof scripts reference files by name, so names are restricted by `core/security.py` `SAFE_NAME`.
- **`agent/workspace.py`.** Loads each CSV and each visible XLSX sheet as a `Table`. A table keeps the `raw` all-string frame (used by the scanner) and `dtypes` (what scripts will see). It also carries `load`, the exact pandas snippet the LLM must use. TXT, MD and PDF files become `documents`, which are treated as authoritative business rules.
- **`agent/scan.py`.** A deterministic trap scan that produces `Finding`s with ids `T1…` and a list of tables and columns each one affects. `relevant()` decides which findings a script touches by checking for the file name and a quoted column name in the code.
- **`agent/premises.py`.** Premise Audit: the LLM extracts the question's premises, and Python checks them (calendar validity, overlap with the data's date range, column/value existence).
- **`agent/pipeline.py`.** `Agent.ask()` is a generator of NDJSON events (`scan`, `premises`, `plan`, `exec`, `result`):
  1. triage and premises;
  2. plan 1–4 interpretations, retrying on any of these (all deterministic):
     - trap-coverage gaps;
     - Number Firewall leaks;
     - `lint()` hits: regexes for pandas mistakes that give wrong numbers without an error, plus a currency-unit mismatch check;
     - named entities (`premises.entities`) that the code never filters on;
  3. sandbox each interpretation, with up to 2 LLM repairs and a determinism re-run. If a which/who question returns a dict, that counts as a failure and is repaired;
  4. `_finish` decides answered / ambiguous / refused, sets the proof strength L0–L3, and saves the run.

  All prompts live in this file.
- **`agent/sandbox.py`.**
  - `build_script` produces each proof script from four parts: the trusted HEADER (SHA-256 assertions on the inputs), the trusted HELPERS (`is_missing`, `parse_money`, `parse_dates`, `replace_from`), the agent's code, and the trusted FOOTER (prints `PROOFLENS_RESULT=`).
  - `gate()` is the AST safety check. `run()` executes the script with `python -I` in a temp copy of the workspace.
  - `same()` is the tolerant comparison used everywhere.
- **`agent/bundle.py`.** The judge-kit zip. Its `verify_all.py` uses only the stdlib and duplicates `same()`.
- **`api/routes/workspaces.py`.** All endpoints: `/workspaces`, `/demo`, `/files`, `/ask` (a StreamingResponse), `/runs`, `/rerun`, `/adopt` and `/bundle.zip`. `/demo` copies files from the repo-level `demo/` directory.

### Frontend (`frontend/src`)
- React 19, TypeScript, Vite and Tailwind 4.
- `api/client.ts` holds every type and call. `ask()` is an async generator over the NDJSON stream.
- `store/workspaceStore.ts` is a Zustand store that remembers the workspace id in localStorage. `AppShell` reloads the summary on mount.
- **Naming.** The UI brand is **Zynex**, the team name: `productConfig.name`, the page title and the package name. Keep it. ProofLens is the name used in the backend and docs.
- **Layout.** A top bar with three numbered steps (Data → Ask → Evidence); there is no sidebar or mobile drawer.
- **Pages:**
  - `WorkspacePage`: upload, demo, trap list.
  - `AskPage`: live progress log plus the result.
  - `EvidencePage`: run history plus the proof-kit download.
- **`components/proof/RunView.tsx`** renders each run as an answer certificate:
  - verdict, question, and the answer, Interpretation Matrix or refusal;
  - `ProofSeal`, an SVG with one arc per proof level;
  - the checks, traps, premises, scripts and the re-run control.
- **`styles/index.css`** is the only stylesheet. Design tokens live on `:root`, and the verdict colour flows through `--tone` on `.cert--{status}`. Tailwind is imported only for its reset; no utility classes are used.

## Rules to keep
- The LLM never states a number that reaches the user. Displayed values come only from script output; see `firewall()` and `fill()` in `pipeline.py`.
- Never weaken `sandbox.gate()` to make generated code pass. Fix the prompt or the helpers instead. Helper and footer code must pass the gate too, so avoid `getattr`, `...` in strings, and similar constructs.
- If you change the scan, the prompts or the helpers, re-run `eval.py`. The model is small, so prompt wording matters.
- Ruff selects E, F, I, B, UP, S and ASYNC at a line length of 100. `pipeline.py` is exempt from E501 because it holds prompt prose. mypy runs in strict mode.
