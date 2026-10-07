# Zynex: a proof-carrying data analyst

**HackNex 2026 · HNX26PS108 · Agentic GenAI · Team Zynex**

Zynex answers questions about messy, multi-table business data, such as CSV files, Excel
workbooks and policy documents. Its rule is simple: **every number it shows comes from a standalone
Python script that anyone can re-run to get the same number.** When a question can't be answered
reliably, Zynex does not guess. It issues a **refusal certificate** that says why, and what data
would make the question answerable.

**Zynex is the product and project name.** Some internal package names, storage keys, generated
proof markers and download filenames still contain the legacy `prooflens` identifier. They are
documented where they affect commands or file formats, but they are not a second product.

---

## Contents

1. [Problem and approach](#1-problem-and-approach)
2. [Quick start](#2-quick-start)
3. [Using the app](#3-using-the-app)
4. [Architecture](#4-architecture)
5. [Repository layout](#5-repository-layout)
6. [How a question is answered, step by step](#6-how-a-question-is-answered-step-by-step)
7. [Anatomy of a proof script](#7-anatomy-of-a-proof-script)
8. [Backend components](#8-backend-components)
9. [API reference](#9-api-reference)
10. [Storage layout and the run record](#10-storage-layout-and-the-run-record)
11. [Frontend components](#11-frontend-components)
12. [The judge kit](#12-the-judge-kit)
13. [Demo data and evaluation](#13-demo-data-and-evaluation)
14. [Configuration](#14-configuration)
15. [Security model](#15-security-model)
16. [Testing and quality checks](#16-testing-and-quality-checks)
17. [Limits and upgrade paths](#17-limits-and-upgrade-paths)

---

## 1. Problem and approach

The problem statement asks for an agent that answers questions about messy data and documents,
under these scoring rules:

- every number needs re-runnable code that reproduces it, otherwise it scores 0;
- a confident wrong answer scores **worse** than a reasoned "I can't determine this";
- the data contains traps: `$`/`€` mixed in one column, ambiguous dates, duplicate rows, tables
  that contradict each other, missing data, questions with no valid answer, and trick questions.

Zynex treats the language model as a **planner and code writer only**. The model never decides
what number the user sees. Every number comes from executing code, and every safety decision is
made by deterministic Python:

| Feature | What it does | Trap it targets |
|---|---|---|
| **Trap scanner** | A deterministic scan, with no LLM, that runs before any question. It flags duplicate rows, missing markers (`""`, `N/A`, `null`, `-`), mixed currencies in one column, DD/MM vs MM/DD dates, and cross-table contradictions on shared ID keys. The agent must handle every flagged trap its code touches, or it refuses. | duplicates, missing data, units, dates, contradictions |
| **Premise Audit** | The question's premises (columns, named values, dates, periods) are extracted and checked against the data before any code is written. "Revenue on Feb 30" or "revenue in 2023" (no 2023 data) produce a refusal that names the failed premise. | trick and unanswerable questions |
| **Interpretation Matrix** | When the answer depends on a choice no document resolves, such as how to read `02/03/2024`, every reading is computed as its own proof. If all readings agree, the answer stands. If they disagree, the user sees each answer next to its assumption and picks one. | ambiguity |
| **Number Firewall** | The model may not type numbers. Explanations use `{{answer}}` placeholders filled from script output. A digit that appears in neither the question nor a document is rejected. | invented numbers |
| **Code checks** | Regex lints, a currency-unit check and a named-entity coverage check catch pandas mistakes that silently give wrong numbers. When one fires, the plan is sent back with specific advice. | wrong math without an error |
| **Proof Strength L0–L3** | An evidence ladder instead of a model "confidence": L1 the script runs, L2 a fresh-process re-run gives identical output with inputs pinned by SHA-256, L3 every interpretation agrees. | trust signal |
| **Judge kit** | A zip of the data, every proof script, `claims.json` and a stdlib-only `verify_all.py`. One command re-checks every claim. | "can someone else run it?" |

### Technologies, libraries and model

The versions below come from `backend/pyproject.toml`, `backend/requirements.txt` and
`frontend/package-lock.json`. The lockfiles and pinned runtime requirements are the source of truth.

| Layer | Technology | Version or constraint | Use |
|---|---|---|---|
| Local model runtime | Ollama | External prerequisite | Runs the language model locally through `/api/chat`; no hosted AI API is required. |
| Default model | Qwen 3 8B | `qwen3:8b` | Extracts premises, plans pandas analysis code and repairs failed code. It does not directly supply displayed numeric answers. |
| Backend language | Python | `>=3.12,<3.13` | API, deterministic checks, proof generation and execution. |
| API | FastAPI / Uvicorn | `0.115.12` / `0.34.2` | REST API, NDJSON streaming, validation and serving. |
| Schemas and settings | Pydantic / pydantic-settings | `2.11.4` / `2.9.1` | Request models, response models and validated `APP_*` configuration. |
| Data analysis | pandas / NumPy | `3.0.6` / `2.5.3` in `requirements.txt` | Table loading, deterministic transformations and generated proof execution. |
| File support | openpyxl / pypdf / python-multipart | `3.1.5` / `6.19.0` / `0.0.20` | XLSX parsing, PDF text extraction and uploads. |
| Model HTTP client | HTTPX | `0.28.1` | Calls local Ollama and checks model health. |
| Frontend | React / React DOM | `19.3.0` | Browser UI. |
| Frontend language/build | TypeScript / Vite | `6.0.3` / `8.3.3` | Strict type checking, development server and production bundle. |
| Navigation/state | React Router / Zustand / TanStack Query | `7.18.4` / `5.0.15` / `5.104.1` | Routes, remembered workspace state and server-state queries. |
| Styling/icons | Tailwind CSS / Lucide React | `4.3.3` / `1.52.0` | CSS reset/build integration and interface icons. The visual system itself is custom CSS. |
| Backend quality | pytest / Ruff / mypy | `8.3.5` / `0.11.9` / `1.15.0` | Tests, lint/format checks and strict type checking. |
| Frontend quality | Vitest / Testing Library / ESLint / Prettier | See `frontend/package.json` | UI tests, linting and formatting. |

Ollama receives schemas, sample values, document excerpts, the question and deterministic scan
findings. The default model call uses JSON-schema output, `temperature: 0`, `seed: 7`,
`think: false` and a `12288` token context. Seeded generation improves repeatability but does not
make model output perfectly deterministic; the proof scripts and deterministic checks are the
source of trust. You may select another Ollama chat model with `APP_OLLAMA_MODEL`, provided it
supports structured JSON-schema output.

---

## 2. Quick start

### Prerequisites

- Python 3.12.x. The backend explicitly requires `>=3.12,<3.13`.
- Node.js 20 or newer and npm. Node 24.10.0 and npm 11.6.1 were used for the latest local check.
- [Ollama](https://ollama.com) with the configured model downloaded. The default is `qwen3:8b`.
- Enough memory for the selected model. Requirements vary by model and quantization.

Confirm the tools are available:

```text
python --version
node --version
npm --version
ollama --version
```

### Windows PowerShell

```powershell
ollama pull qwen3:8b
# Start `ollama serve` separately if Ollama is not already running as a service.

# Backend (terminal 1)
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 8000

# Frontend (terminal 2, from the repository root)
cd frontend
npm ci
npm run dev          # http://localhost:5173
```

### macOS or Linux

```bash
ollama pull qwen3:8b
# Start `ollama serve` separately if Ollama is not already running as a service.

# Backend (terminal 1)
cd backend
python3.12 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

# Frontend (terminal 2, from the repository root)
cd frontend
npm ci
npm run dev
```

Run Uvicorn from `backend/` because the backend reads `.env` relative to its working directory.
The frontend API URL defaults to `http://127.0.0.1:8000`; set `VITE_API_BASE_URL` before
starting or building Vite to override it.

- Interactive API docs (Swagger) are at `http://127.0.0.1:8000/docs`.
- `GET /api/v1/health` reports whether storage is writable and whether Ollama has the configured
  model.
- The frontend is normally at `http://localhost:5173`.

Verify the backend before opening the UI:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health
```

or:

```bash
curl http://127.0.0.1:8000/api/v1/health
```

The response is healthy when `storage` and `llm` are both `available`. A `degraded` status
with `llm: unavailable` means the API is running but Ollama is not reachable. `model_missing`
means Ollama is reachable but the configured model has not been pulled.

### Development dependencies

The quick start installs pinned backend runtime dependencies. Contributors who need pytest, Ruff
and mypy should install the package with its development extra:

```powershell
cd backend
.\.venv\Scripts\python -m pip install -e ".[dev]"
```

On macOS or Linux, replace `.\.venv\Scripts\python` with `./.venv/bin/python`.

### Docker backend

The Dockerfile builds the backend only. Run the frontend separately with `npm run dev`, or deploy
the contents of `frontend/dist` after `npm run build`.

```bash
docker build -t zynex-backend backend
docker run --rm --name zynex-backend -p 8000:8000 \
  -v zynex-data:/app/data zynex-backend
```

The image runs as a non-root user and uses `http://host.docker.internal:11434` for Ollama. On Linux
you may also need `--add-host=host.docker.internal:host-gateway`. The current image does not copy
the repository-level `demo/` directory, so **Load the demo data** is unavailable in the container;
upload the demo files manually or run the backend from source for the complete demonstration.

---

## 3. Using the app

The top bar shows the three steps in order: **1 Data → 2 Ask → 3 Evidence**.

### Step 1: Data

1. Click **Add files** (CSV, XLSX, MD, TXT or PDF, up to 20 MB each), or **Load the demo data**.
2. The trap scanner runs immediately. **Data traps found** lists each problem, with the table it
   affects and real examples from your data.
3. **Files** shows each file with the first 12 characters of its SHA-256 hash. **Tables** shows a
   preview of every CSV and every visible Excel sheet. **Business rules** shows the documents; the
   model treats them as authoritative.

### Step 2: Ask

1. Type a question, or click one of the demo questions.
2. A live progress log streams each stage: the scan, the premise check, the plan (including any
   rejected plans and why), each proof script run, and the certificate.
3. The result is an **answer certificate**:
   - **Answered** (green): the answer in large type, the explanation, and the assumptions.
   - **Depends on a reading** (amber): the Interpretation Matrix, with one row per reading, its
     assumptions and its answer. **Use this reading** resolves it.
   - **Refused** (red): the reason, what would make the question answerable, and a reason code.
4. Beside every certificate is the **proof seal**, a ring of three arcs (one per proof level) with
   the checks that passed. Below it are:
   - the data traps the code handled and how;
   - the premises that were checked;
   - each proof script with **Copy script**;
   - **Re-run proofs**, which re-executes the scripts on the server and compares the results;
   - the SHA-256 hashes the proof is pinned to.

### Step 3: Evidence

The history of every question asked about this data, plus **Download proof kit**. See
[the judge kit](#12-the-judge-kit).

---

## 4. Architecture

```
┌──────────────────────── Browser (React, Vite) ─────────────────────────┐
│  Data page        Ask page (NDJSON stream reader)     Evidence page    │
└───────────────┬───────────────────────────────────────────┬────────────┘
                │ REST + application/x-ndjson               │ GET bundle.zip
┌───────────────▼───────────────────────────────────────────▼────────────┐
│ FastAPI  /api/v1                                                       │
│  routes/workspaces.py ── workspace.py (load files, hash, tables, docs) │
│        │                                                               │
│        ▼                                                               │
│  pipeline.Agent.ask()  (generator of progress events)                  │
│   ├─ scan.py          deterministic trap scan                          │
│   ├─ premises.py      deterministic premise checks, entity matching    │
│   ├─ llm.py ──────────────────────────────► Ollama /api/chat           │
│   │                   JSON-schema output, temperature 0, seed 7        │
│   ├─ checks           trap coverage, Number Firewall, lints, entities  │
│   └─ sandbox.py       AST gate → `python -I proof.py` in a temp copy   │
│  bundle.py            judge-kit zip                                    │
└───────────────┬────────────────────────────────────────────────────────┘
                ▼
   data/workspaces/<32-hex id>/   original files + runs/<run id>.json
```

- **No database.** A workspace is a directory, so proof scripts can open `orders.csv` by name,
  exactly as they will inside the judge kit.
- **No cloud calls.** The LLM is a local Ollama model. Dataset rows never leave the machine.
- **Streaming.** `/ask` returns newline-delimited JSON events from a synchronous generator, so the
  UI shows progress during the 20–90 seconds a local model needs.

---

## 5. Repository layout

```
HackNex/
├── backend/
│   ├── app/
│   │   ├── main.py                FastAPI app: lifespan, CORS, upload-size guard, logging
│   │   ├── validation.py          CSV/XLSX content checks (encoding, zip bombs, macros)
│   │   ├── core/                  config.py, security.py, errors.py, logging.py
│   │   ├── api/routes/            health.py, workspaces.py (every product endpoint)
│   │   └── agent/
│   │       ├── workspace.py       workspace directory ↔ tables, documents, hashes
│   │       ├── scan.py            deterministic trap scanner
│   │       ├── premises.py        Premise Audit, data date range, entity matching
│   │       ├── llm.py             minimal Ollama client with JSON-schema output
│   │       ├── pipeline.py        the agent: prompts, checks, verdicts, run storage
│   │       ├── sandbox.py         AST gate, script builder, subprocess runner
│   │       └── bundle.py          judge-kit zip and verify_all.py
│   ├── tests/                     unit and integration tests (pytest)
│   ├── eval.py                    scores the agent on demo/questions.json
│   ├── Dockerfile, pyproject.toml, .env.example
├── frontend/
│   ├── index.html                 fonts, title, metadata
│   └── src/
│       ├── api/client.ts          types and API calls, including the NDJSON async generator
│       ├── store/workspaceStore.ts  current workspace (Zustand + localStorage)
│       ├── components/layout/     AppShell (top bar), Brand, Footer
│       ├── components/proof/RunView.tsx   answer certificate and proof seal
│       ├── components/ui/         Button, PageHeader, StatusMessage, SkipLink, ErrorBoundary
│       ├── pages/                 WorkspacePage, AskPage, EvidencePage, LegalPage, NotFoundPage
│       └── styles/index.css       the only stylesheet (design tokens on :root)
├── demo/
│   ├── build_demo.py              generates the messy demo data and the expected answers
│   ├── orders.csv, customers.xlsx, policy.md, questions.json
└── CLAUDE.md                      notes for AI coding assistants working on this repo
```

---

## 6. How a question is answered, step by step

```
question
   │
   ▼
① trap scan ───────────────► findings T1..Tn (facts, not opinions)
   │
   ▼
② premise audit (LLM extracts, Python checks) ──fails──► REFUSED (false_premise / no_data)
   │                         └─ LLM says forecast/opinion/off-topic ──► REFUSED
   ▼
③ plan 1–4 interpretations (LLM, JSON schema)
   │   checks: trap coverage · Number Firewall · lints · unit check · entity coverage
   │   └─ problems → retry with feedback (3 attempts) → still uncovered traps → REFUSED
   ▼
④ for each interpretation: build proof script → AST gate → run in subprocess
   │   └─ error / wrong shape → LLM repair (up to 2) → re-run
   │   └─ success → run again in a fresh process (determinism check)
   ▼
⑤ verdict:  all readings agree → ANSWERED
            readings disagree  → AMBIGUOUS (Interpretation Matrix + clarifying question)
            nothing ran        → REFUSED (could_not_compute)
   │
   ▼
⑥ proof strength L0–L3 · explanation filled from script output · run saved to disk
```

### ① Trap scan (`agent/scan.py`, deterministic)

The scan runs over the **raw** text of every table: every cell is read as the original string, so
nothing is cleaned away before it is inspected. Each finding gets an ID (`T1`, `T2`, …), the tables
and columns it affects, a message, a count and real examples.

| Kind | How it is detected |
|---|---|
| `duplicate_rows` | Rows identical to an earlier row after trimming and lower-casing. |
| `duplicate_key` | The first `*id` column repeats more often than whole rows do, so some IDs have conflicting rows. |
| `missing_values` | Cells that are empty or a missing marker: `""`, `na`, `n/a`, `null`, `none`, `nan`, `-`, `--`. |
| `mixed_currency` | One column contains more than one currency (`$`, `€`, `£`, `₹`, `¥` or ISO codes), or a `currency` column holds several codes next to numeric columns. |
| `ambiguous_dates` | Date columns (60% or more of values look like dates) with slash dates where both day and month are ≤ 12, or a mix of ISO and slash formats. |
| `contradiction` | Two tables share an `*id` key and another column, such as `region`, but disagree on that column's value for the same key. |

The findings go into the model's context. `scan.relevant()` later decides which findings a
generated script actually touches: a finding counts when the code references the finding's file
(and sheet) and, for column-level findings, quotes the column name.

### ② Premise Audit (`agent/premises.py` plus one LLM call)

The model gets the schema, sample values, the documents, the data's date range and the trap list.
It returns JSON with:
- **premises**, each one of these kinds:
  - `column`: a field the question needs, e.g. "profit";
  - `value`: a named entity, e.g. "Widgets";
  - `date`: a specific day in `YYYY-MM-DD`, kept exactly as asked, so `2024-02-30` stays;
  - `period`: `YYYY`, `YYYY-MM` or `YYYY-Qn`;
- **decision**: `proceed`, or `refuse` for forecasts, opinions, causal claims or off-topic questions.

Python then checks every premise:
- **column:** a case-insensitive match against all table columns;
- **value:** a case-insensitive substring search in every table and document;
- **date:** a real calendar date, inside the data's date range;
- **period:** overlaps the data's date range. Slash dates count under both DD/MM and MM/DD, so a
  trap can't hide a real overlap.

A failed premise produces a refusal that **names the failed premise**, for example "2024-02-30 is
not a real calendar date". No code is written.

### ③ Planning (`agent/pipeline.py`, one LLM call per attempt)

The model returns 1–4 **interpretations**. Each has a label, its assumptions and pandas code that
assigns `result`. The plan also includes `traps_handled` (`[{id, how}]`), a unit, an explanation
template and a clarifying question. The prompt includes:
- the exact load snippet for each table, e.g. `pd.read_excel("customers.xlsx", sheet_name="Customers")`;
- documentation for the trusted helpers, and a standard fix for each trap kind;
- a generic worked example, deliberately not the demo data, so the prompt does not overfit.

Before anything runs, the plan must pass these deterministic checks. Each problem is sent back to
the model as feedback, for up to 3 attempts:

| Check | Fails when |
|---|---|
| Trap coverage | The code touches a finding (by `relevant()`) that `traps_handled` doesn't mention. The model may mark one "not relevant: reason". |
| Number Firewall | The explanation contains a number that appears in neither the question nor a document. |
| Lint: detached array | `x = np.where(...)` assigned to a plain variable. Later row filters won't apply to it, so a "March" total silently becomes the full total. |
| Lint: dropping rows | `df[~is_missing(...)]` drops whole rows for one missing cell, losing valid quantities and dates. |
| Lint: helper misuse | `df[col].is_missing()` instead of `is_missing(df[col])`. |
| Unit check | The answer unit is a currency, but `result` aggregates a different currency's column, e.g. answering "in EUR" from `usd`. |
| Entity coverage | The question names a value that exactly matches a data cell ("Widgets" → `Widget`), but the code never filters on it. |

If traps are still uncovered after 3 attempts, the agent refuses with `unhandled_trap`. A
firewall leak that survives is replaced by the neutral template `The result is {{answer}}.`

### ④ Proof execution (`agent/sandbox.py`)

Each interpretation's code is wrapped into a standalone proof script (see [section 7](#7-anatomy-of-a-proof-script)),
then:

1. **AST gate on the agent's code alone**, so error line numbers match the model's own code.
2. **AST gate on the full script**, then a run with `python -I proof.py`:
   - in a temporary copy of the workspace;
   - with a minimal environment;
   - with a 20 s timeout.
3. **Shape check.** A "which/who" question must return a single label, not a breakdown, so
   `result = totals.idxmax()`. A wrong shape counts as a failure.
4. **On failure**, the error is explained in the model's own line numbers (the exception message
   plus the failing line). The model gets up to **2 repair attempts**.
5. **On success**, the script runs **again in a fresh process**. Identical output marks it
   deterministic.

### ⑤ Verdict and ⑥ proof strength (`Agent._finish`)

Values are compared with `same()`: a relative tolerance of 1e-6 for numbers, recursive for dicts
and lists, case-insensitive for strings.

| Outcome | Status |
|---|---|
| A premise failed, the model refused, traps were uncovered, or no script ran | `refused`, with `code`, `reason` and `needed` |
| Every successful interpretation gives the same value | `answered` |
| Successful interpretations disagree | `ambiguous`: the Interpretation Matrix plus a clarifying question |

| Proof strength | Requirement |
|---|---|
| **L0 No claim** | Refused, so no number was produced. |
| **L1 Runs** | At least one proof script ran. |
| **L2 Reproducible** | Every successful script gave identical output in a fresh process, and the inputs are hash-pinned. |
| **L3 Robust** | Every interpretation ran, and all agree. |

The explanation template is filled **only** from script output (`{{answer}}`,
`{{interp_N.answer}}`). The run record is saved to `runs/<id>.json`.

**Refusal codes:** `no_data`, `false_premise`, `out_of_scope`, `ambiguous_unresolvable`,
`contradiction`, `forecast_or_opinion`, `could_not_compute`, `unhandled_trap`.

---

## 7. Anatomy of a proof script

Every script is built from four parts. Only the third is written by the model:

```python
# ProofLens proof script — re-run with:  python proofs/1a2b3c4d5e6f_1.py   (from the data folder)
# Question: What is the total revenue in USD?
# Interpretation: Standard interpretation
# Assumption: EUR converted at 1.10 USD per the policy document
import hashlib as _hashlib, json as _json, pathlib as _pathlib       # ① HEADER (trusted)
_INPUTS = {"orders.csv": "551041e0…", "customers.xlsx": "004f1fca…", "policy.md": "d61ab3f6…"}
for _name, _digest in _INPUTS.items():
    assert _hashlib.sha256(_pathlib.Path(_name).read_bytes()).hexdigest() == _digest, (
        f"{_name} changed since this proof was made; the answer no longer applies")

# ---- cleaning helpers (trusted, deterministic) ----              ② HELPERS (trusted)
def is_missing(series): ...        # empty cells and NA / N/A / null / - markers
def parse_money(series): ...       # "$1,200.50" → (1200.5, "USD"); "€80" → (80.0, "EUR")
def parse_dates(series, slash_order="DMY"): ...  # ISO exact; slash dates per stated order
def replace_from(table, source, key, column): ... # take a column from the authoritative table

# ---- analysis (agent-written) ----                                ③ AGENT CODE
orders = pd.read_csv("orders.csv").drop_duplicates()
orders["value"], orders["currency"] = parse_money(orders["amount"])
orders["usd"] = np.where(orders["currency"] == "EUR", orders["value"] * 1.10, orders["value"])
result = orders["usd"].sum()

# ---- result (trusted) ----                                        ④ FOOTER (trusted)
# converts numpy/pandas values to plain JSON, unwraps a single-key dict,
# raises if the result is empty or NaN, then prints:
print("PROOFLENS_RESULT=" + _json.dumps({"answer": _answer}))
```

The helpers are copied into the script itself rather than imported, so the script needs only
pandas and openpyxl and a reviewer can read every line that produced the number. They exist
because small models get these steps wrong. For example, a hand-written cleanup that strips `$` and
`€` *before* reading which currency each row was in can no longer convert the euro rows.

---

## 8. Backend components

| Module | Responsibility and how it works |
|---|---|
| `app/main.py` | Builds the FastAPI app. The **lifespan** step creates `data/workspaces` and probes that the data folder is writable. Middleware rejects oversized uploads (`POST …/files` whose `Content-Length` exceeds the limit), adds `X-Request-ID` and `X-Content-Type-Options: nosniff`, and logs every request as JSON. CORS allows only the configured origins. |
| `core/config.py` | `Settings`, read from `APP_*` environment variables and `.env`, with validation: no wildcard CORS, log level allowlist, the data folder can't be a filesystem root. |
| `core/security.py` | `validate_original_filename`: allowed extensions plus `SAFE_NAME` (letters, digits, space, `_ - .`; no `..`), because proof scripts embed file names in code. `contained_path` resolves paths and rejects anything outside the workspace. `workspace_dir` accepts only a 32-hex ID that exists. |
| `core/errors.py` | `AppError(status, code, message)` and handlers that return `{error_code, message, request_id}`. Unexpected errors are hidden behind a generic message. |
| `validation.py` | **CSV:** must be UTF-8 and must not be a disguised zip or executable. **XLSX:** a valid zip with at most 10,000 entries and 200 MB expanded; no macros, embedded objects or encryption. |
| `agent/workspace.py` | `save_upload` streams to a temporary file in 64 KB chunks with a size cap, validates it, then atomically replaces the destination. `load()` reads each CSV and each **visible** XLSX sheet twice: as typed pandas (the dtypes scripts will see) and as raw strings (for the scanner). It extracts text from MD, TXT and PDF documents (up to 6000 characters each) and SHA-256 hashes every file. |
| `agent/scan.py` | The deterministic trap scanner (see [section 6](#6-how-a-question-is-answered-step-by-step)) and `relevant()`. |
| `agent/premises.py` | `check()` for the four premise kinds. `data_date_range()` covers every date reading. `entities()` finds question words that exactly match a data cell (with plural forms), for the entity coverage check. |
| `agent/llm.py` | One method, `json(system, user, schema)`. It calls Ollama `/api/chat` with the JSON schema as `format`, `think: false`, `temperature: 0`, `seed: 7` and `num_ctx: 12288`, then parses and validates the reply. Failures become `503 llm_unavailable` or `502 llm_bad_output`. |
| `agent/pipeline.py` | All prompts and schemas, the deterministic checks (`firewall`, `lint`, `LINTS`, `WHICH`), formatting (`display`, `fill`) and the `Agent`: `ask()` (steps ①–③), `_prove()` (step ④) and `_finish()` (steps ⑤–⑥). Also `save_run` and `load_runs`. |
| `agent/sandbox.py` | `gate()` (AST allowlist), `build_script()`, `run()` (subprocess and result parsing), `explain_error()` (maps tracebacks to the agent's line numbers) and `same()`. |
| `agent/bundle.py` | `build()` writes the judge-kit zip in memory. |
| `api/routes/workspaces.py` | Every product endpoint (see [section 9](#9-api-reference)). |
| `api/routes/health.py` | A storage write probe plus an Ollama `/api/tags` check that the configured model is installed. |
| `eval.py` | Runs every demo question through the real agent and scores it ([section 13](#13-demo-data-and-evaluation)). |

---

## 9. API reference

Base URL: `http://127.0.0.1:8000/api/v1`. Errors return `{error_code, message, request_id}`.

| Method and path | Purpose |
|---|---|
| `GET /health` | `status` (`ok`/`degraded`/`unavailable`), storage, `llm` (`available`/`model_missing`/`unavailable`), model. |
| `POST /workspaces` | Create an empty workspace. Returns its summary. |
| `POST /workspaces/demo` | Create a workspace preloaded with `demo/`. |
| `GET /workspaces/{id}` | Summary: `files` (name, sha256), `tables` (name, load snippet, rows, columns with dtypes, preview rows), `documents` (name, excerpt) and `findings`. |
| `POST /workspaces/{id}/files` | Upload one file (multipart field `file`). Returns the updated summary. A file with the same name is replaced, which invalidates its old proofs by design. |
| `DELETE /workspaces/{id}/files/{name}` | Remove a file. |
| `POST /workspaces/{id}/ask` | Body `{"question": "…"}` (3–1000 characters). Streams `application/x-ndjson` events (below). |
| `GET /workspaces/{id}/runs` | Every run record, newest first. |
| `POST /workspaces/{id}/runs/{run}/rerun` | Re-executes every stored proof script and returns `claimed`, `reproduced` and `match` for each. |
| `POST /workspaces/{id}/runs/{run}/adopt` | Body `{"index": n}`. Resolves an ambiguous run by choosing interpretation `n`. |
| `GET /workspaces/{id}/bundle.zip` | Downloads the judge kit. |

**Stream events from `/ask`**, one JSON object per line:

| `type` | Fields | Meaning |
|---|---|---|
| `scan` | `findings[]` | The trap scan result. |
| `premises` | `premises[]` (each with `ok`, `detail`), `decision` | The Premise Audit result. |
| `plan` | `attempt`, `status: "thinking"` | A planning attempt started. |
| `plan` | `attempt`, `status: "checked"`, `interpretations[]`, `traps_handled[]`, `problems[]` | A plan was checked. An empty `problems` means it was accepted. |
| `exec` | `index`, `label`, `attempt`, `ok`, `error` | One proof script execution. |
| `result` | `run` | The final run record (see [section 10](#10-storage-layout-and-the-run-record)). |
| `error` | `error_code`, `message` | For example, Ollama is unreachable. |

---

## 10. Storage layout and the run record

```
data/workspaces/<32-hex id>/
├── orders.csv                 uploaded files, under their sanitised original names
├── customers.xlsx
├── policy.md
└── runs/
    └── <12-hex run id>.json   one record per question
```

A run record contains:

| Field | Content |
|---|---|
| `id`, `question`, `created_at`, `model` | Identity and provenance. |
| `hashes` | The SHA-256 of every input file when the question was asked. |
| `premises[]` | `{kind, column, value, ok, detail}`. |
| `traps[]` | The findings this answer touched, plus `how` the code handled each one. |
| `interpretations[]` | `{index, label, assumptions, script, ok, value, display, deterministic, error}`. |
| `status` | `answered`, `ambiguous` or `refused`. |
| `answer`, `display`, `unit`, `explanation` | The answer and its text. The text is filled only from script output. |
| `clarifying_question` | Set for ambiguous runs. |
| `refusal` | `{code, reason, needed}`, for refused runs. |
| `strength` | `{level, checks[{level, name, passed, detail}]}`. |
| `adopted` | The interpretation the user chose for an ambiguous run, if any. |

---

## 11. Frontend components

React 19, TypeScript (strict), Vite, Tailwind 4 (used only for its CSS reset), Zustand,
TanStack Query and lucide-react icons.

| File | Role |
|---|---|
| `api/client.ts` | Every type (`Run`, `Interpretation`, `Finding`, `AgentEvent`, …) and every call. `ask()` is an **async generator**: it reads the response body stream, splits it on newlines and yields typed events. `API_BASE` defaults to `http://127.0.0.1:8000`. |
| `store/workspaceStore.ts` | The current `workspaceId` (kept in localStorage, wrapped in try/catch) and its `summary`. `forget()` starts over. |
| `components/layout/AppShell.tsx` | Skip link, a top bar with the brand, numbered step navigation and a "N files, N traps" status, the routed page, and the footer. It reloads the workspace summary on mount and forgets the workspace if it no longer exists. |
| `pages/WorkspacePage.tsx` | Upload (multiple files, one at a time), demo loading, the trap list (`FindingList`), files with hashes and delete, table previews and documents. |
| `pages/AskPage.tsx` | The question box (Enter submits), demo questions, a live progress log (`describe()` turns each event into a sentence), and the resulting certificate. Uses an AbortController to cancel a previous question. |
| `pages/EvidencePage.tsx` | The proof-kit download and every run (`useQuery`). Adopting a reading refreshes the list. |
| `components/proof/RunView.tsx` | **The answer certificate.** `ProofSeal` is an SVG ring of three arcs (one per proof level) inked in the verdict colour; the arcs draw in once and respect `prefers-reduced-motion`. `Checks` lists the proof-level checks. Also: the Interpretation Matrix with "Use this reading", the refusal section, `Context` (traps handled, de-duplicated premises), `ProofScript` (copy) and `Rerun`. |
| `components/ui/*` | `Button`, `PageHeader`, `StatusMessage` (`role=status` or `alert`), `SkipLink`, `RootErrorBoundary`. |
| `styles/index.css` | One stylesheet. Tokens on `:root`: ledger paper `#F2F4EF`, ink `#17231E`, verified `#2E6A4E`, ambiguous `#94580A`, refused `#AD2A20`. Each certificate sets `--tone` from its status, and that colours its border, verdict and seal. Fonts are Schibsted Grotesk, plus JetBrains Mono for code and hashes. Responsive down to 320 px, with visible focus and reduced motion respected. |

---

## 12. The judge kit

**Evidence → Download proof kit** (`GET /workspaces/{id}/bundle.zip`) produces:

```
prooflens-proof-kit.zip
├── orders.csv, customers.xlsx, policy.md   the exact data, matching the pinned hashes
├── proofs/<run>_<n>.py                     one standalone script per claimed number
├── claims.json                             question, status, interpretation, assumptions, claimed value
├── verify_all.py                           stdlib-only verifier
└── README.md
```

```powershell
pip install pandas openpyxl
python verify_all.py
```

`verify_all.py` runs each script, reads its `PROOFLENS_RESULT=` line and compares the value with
the claim using the same tolerance rules as the server. It prints `PASS`, `FAIL` or `REFUSED` (with
the reason) per claim, and exits with status 1 if anything fails. For an adopted ambiguous run, only
the chosen reading is included.

---

## 13. Demo data and evaluation

`demo/` is the reproducibility fixture used by the UI, tests and evaluator. It is committed so
the demonstration can be run without preparing private data.

### Reproduce the browser demonstration

1. Pull and start the configured Ollama model.
2. Start the backend and frontend with the commands in [Quick start](#2-quick-start).
3. Check `http://127.0.0.1:8000/api/v1/health`. Continue when `storage` and `llm` are
   `available`.
4. Open `http://localhost:5173` and choose **Load the demo data**.
5. On **Data**, verify that `orders.csv`, `customers.xlsx` and `policy.md` are present. Zynex
   should identify all five planted trap categories: duplicate rows, missing values, mixed
   currency, ambiguous dates and a cross-table region contradiction.
6. Go to **Ask** and ask one or more questions from the table below. Progress should stream through
   scan, premise, plan and proof-execution stages.
7. For an answered question, expand the proof, use **Re-run proofs**, and confirm the reproduced
   value matches the claim.
8. For the March 2024 question, verify that Zynex either shows the competing DMY/MDY readings or
   gives a reasoned refusal. For impossible dates, missing fields, absent periods and forecasts,
   verify that it refuses instead of inventing a value.
9. Go to **Evidence**, download `prooflens-proof-kit.zip`, extract it, and run:

```bash
python -m pip install pandas openpyxl
python verify_all.py
```

The verifier must print `PASS` for each included numeric claim and exit with status 0. The
`PROOFLENS_RESULT=` marker and ZIP filename are legacy wire-format identifiers retained by the
implementation; the product name is Zynex.

### Regenerate the fixture and answer key

`python demo/build_demo.py` regenerates the demo and computes the expected answers from the same
source rows, so the answer key can't drift from the data:

```bash
# Run from the repository root. This overwrites the four generated files in demo/.
python demo/build_demo.py
```

| File | Planted traps |
|---|---|
| `orders.csv` | 34 rows: 4 re-imported duplicates, `$` and `€` amounts in one column, `""`/`N/A` missing amounts, ISO dates mixed with ambiguous `02/03/2024`-style dates. |
| `customers.xlsx` | The `Customers` sheet contradicts the orders' `region` for 3 customers. There is also a `Targets` sheet. |
| `policy.md` | 1 EUR = 1.10 USD; the fiscal year starts 1 April; the customer master is authoritative for region; orders without an amount are excluded from revenue; one order ID is one sale. |

`demo/questions.json` holds 11 reference questions. Numeric values in this table are computed by
`demo/build_demo.py`, rather than copied from model output:

| # | Question | Expected |
|---|---|---|
| 1 | How many unique orders are there? | 30 |
| 2 | What is the total revenue in USD? | 3,638.00 |
| 3 | What was the total revenue in USD in March 2024? | ambiguous (DMY gives 668.50, MDY gives 280.00) |
| 4 | Which region generated the most revenue in USD? | West (by the authoritative region) |
| 5 | How many orders have no recorded amount? | 3 |
| 6 | What is the average order amount in EUR for orders paid in EUR? | 122.50 |
| 7 | How many Widgets were sold in total? | 42 |
| 8 | What was the revenue on February 30, 2024? | refuse (not a real date) |
| 9 | What is our total profit margin? | refuse (no cost data) |
| 10 | How much revenue did we make in 2023? | refuse (no data in that period) |
| 11 | What will revenue be next quarter? | refuse (forecast) |

```powershell
cd backend
.\.venv\Scripts\python eval.py                 # all questions
.\.venv\Scripts\python eval.py --only 3 7      # selected questions
.\.venv\Scripts\python eval.py --model qwen3:14b
```

`eval.py` prints PASS or FAIL per question, the status, the proof strength and the time taken. It
also re-runs every proof in a fresh process and reports the re-run success rate. For the ambiguous
question, either the matrix or a reasoned refusal counts as correct.

**Recorded demonstration result with `qwen3:8b`:** 11/11 evaluation cases passed and 12/12
generated proofs reproduced. This is a recorded run, not a guarantee: earlier development runs
scored 8–10/11 because local-model generation can vary. Record the model tag, Ollama version and
complete `eval.py` output when reporting a new result. The current code fixes temperature at 0 and
seed at 7, but runtime and model-version differences can still change a plan.

---

## 14. Configuration

Backend settings come from `APP_*` environment variables or `backend/.env`:

| Variable | Default | Meaning |
|---|---|---|
| `APP_ENV` | `development` | Reported by `/health`. |
| `APP_HOST`, `APP_PORT` | `127.0.0.1`, `8000` | Bind address. |
| `APP_LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` or `CRITICAL`. |
| `APP_DATA_DIR` | `data` | Where workspaces are stored. |
| `APP_MAX_UPLOAD_BYTES` | `20971520` (20 MB) | Per-file upload limit. |
| `APP_ALLOWED_ORIGINS` | `["http://localhost:5173"]` | CORS origins (JSON list; no wildcard). |
| `APP_OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama server. |
| `APP_OLLAMA_MODEL` | `qwen3:8b` | Any Ollama chat model that supports JSON-schema output. |
| `APP_LLM_TIMEOUT_SECONDS` | `300` | Per LLM call. |
| `APP_SCRIPT_TIMEOUT_SECONDS` | `20` | Per proof script execution. |

Frontend: `VITE_API_BASE_URL` overrides the API URL (default `http://127.0.0.1:8000`).

---

## 15. Security model

LLM-written code is untrusted. These defences are layered:

1. **AST gate** (`sandbox.gate`). It rejects:
   - any import outside an allowlist: pandas, numpy, json, math, re, datetime, hashlib, pathlib,
     statistics, decimal, collections, itertools, functools;
   - the names `open`, `eval`, `exec`, `compile`, `__import__`, `getattr`, `setattr`, `delattr`,
     `globals`, `locals`, `vars`, `input`, `breakpoint`, `exit`, `quit`, `help` and `memoryview`;
   - any dunder attribute;
   - file-system mutators (`unlink`, `rmdir`, `mkdir`, `touch`, `chmod`, `write_text`,
     `write_bytes`, `symlink_to`, `hardlink_to`), `system` and `popen`;
   - pickle, SQL, HTML and clipboard I/O;
   - every pandas `to_*` writer except in-memory conversions (`to_numeric`, `to_dict`, …);
   - string literals that look like URLs, absolute paths, `~` or `../` traversal.

   The gate runs on the agent's code and again on the full script.
2. **Process isolation.** Scripts run with `python -I` (isolated mode), with only `PYTHONIOENCODING`
   and `SYSTEMROOT` in the environment, in a fresh **temporary copy** of the workspace, so the
   originals can't be altered. There is a 20 s timeout.
3. **Integrity.** Every proof starts by asserting the SHA-256 of its inputs, so changed data makes
   it fail loudly instead of quietly returning a different number.
4. **Upload hardening.**
   - The filename allowlist and `contained_path` prevent path traversal.
   - Uploads are streamed with a size cap, plus an early `Content-Length` rejection.
   - CSV encoding and content checks; XLSX zip-bomb, macro, embedded-object and encryption checks.
   - Only visible Excel sheets are read.
5. **API.**
   - Workspace IDs are random 128-bit hex.
   - CORS is restricted to configured origins.
   - Pydantic validates request bodies.
   - Error responses never include stack traces.
6. **Privacy.** The LLM is local Ollama, so schemas, sample values and documents never go to a cloud
   service.

---

## 16. Testing and quality checks

Install the backend development extra first; the runtime-only `requirements.txt` does not include
pytest, Ruff or mypy.

```powershell
# backend
cd backend
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\ruff check .
.\.venv\Scripts\ruff format --check .
.\.venv\Scripts\mypy app
.\.venv\Scripts\python -m pytest

# frontend (from the repository root)
cd frontend
npm ci
npm run lint
npm run format:check
npm run test -- --run
npm run build
```

- **Backend:** 22 pytest cases currently pass. They cover:
  - the scanner finding every planted demo trap;
  - the AST gate rejecting `os`, `subprocess`, network and absolute paths;
  - proof reproducibility, and hash tampering being detected;
  - error line mapping;
  - the Number Firewall;
  - lints and the unit check;
  - Premise Audit and entity matching;
  - the judge kit's `verify_all.py` passing end to end;
  - the API endpoints.

  Ruff (E, F, I, B, UP, S, ASYNC; line length 100) and strict mypy also run.
- **Frontend:** 7 Vitest tests across 2 files currently pass. Vitest and Testing Library cover
  routing, active navigation, legal pages, the not-found page, the skip link, keyboard access,
  proof-seal states and proof-source visualization. ESLint, Prettier and the strict TypeScript
  production build are separate checks.
- **Agent accuracy:** `eval.py` (see [section 13](#13-demo-data-and-evaluation)). It needs Ollama.

### Verification snapshot

Checked on 7 October 2026 with Python 3.12.6, Node.js 24.10.0 and npm 11.6.1:

| Check | Result |
|---|---|
| Backend `ruff check .` | Passed |
| Backend `ruff format --check .` | Passed (25 files) |
| Backend strict `mypy app` | Passed (20 source files) |
| Backend pytest | Passed (22 tests; one upstream Starlette deprecation warning) |
| Frontend ESLint | Passed |
| Frontend Vitest | Passed (7 tests in 2 files) |
| Frontend production build | Passed (1,970 modules transformed) |
| Frontend Prettier check | Does not currently pass; it reports style differences in 20 files |
| Live Ollama evaluation | Not re-run for this documentation update because Ollama was installed but not running |

The formatting difference does not affect runtime behavior, but it should be resolved with
`npm run format` and reviewed before treating the repository as fully green.

---

## 17. Limits and upgrade paths

| Limit | Upgrade path |
|---|---|
| The sandbox is an AST gate plus an isolated subprocess, not a container. | Run proof scripts in a network-less, read-only container before any shared deployment. |
| There is no authentication. Anyone who knows a workspace ID can read it. | Add auth and per-user workspaces before exposing the API beyond localhost. |
| An 8B local model takes 20–90 s per question, and accuracy varies between runs. | Use a larger model (`APP_OLLAMA_MODEL`), or run each plan twice and require agreement. |
| Trap detection is heuristic. For example, a contradiction is only detected across a shared `*id` key. | Add more scanners (outliers, unit columns, fuzzy keys) as new data shapes appear. |
| Documents are truncated to 6000 characters, and image-only PDFs yield no text. | Retrieval over document chunks, and OCR. |
| The light theme only. | Add dark-mode tokens under `prefers-color-scheme`. |
