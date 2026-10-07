# ProofLens backend — Phase 4

This service establishes the trusted backend boundary for ProofLens. It securely ingests CSV/XLSX files, stores lifecycle metadata in SQLite, produces deterministic server-side schema and quality profiles, validates the Phase 3 Analysis Specification, and creates a deterministic Proof Contract. It does **not** execute analysis or interpret results.

## Architecture and structure

- `app/api`: versioned FastAPI routes and dependencies
- `app/core`: settings, safe errors, structured logging, and path security
- `app/db`: explicit SQLite migration and metadata repository
- `app/datasets`: upload storage, format validation, parsing, profiling, quality checks, and lifecycle service
- `app/analysis`: Phase 3-compatible models, semantic validation, planning, and Proof Contracts
- `tests`: isolated unit and integration tests
- `docs/API_CONTRACT.md`: frontend reconciliation contract

Binary files stay in `APP_DATA_DIR`; SQLite stores only metadata and JSON profiles. Every accepted upload gets a separate UUID and SHA-256 of its exact bytes.

## Install and run

Requires Python 3.12.

```bash
python -m venv .venv
.venv/Scripts/pip install -e ".[dev]"
copy .env.example .env
.venv/Scripts/uvicorn app.main:app --reload
```

Configuration is environment-based: `APP_ENV`, `APP_HOST`, `APP_PORT`, `APP_LOG_LEVEL`, `APP_DATA_DIR`, `APP_DATABASE_PATH`, `APP_MAX_UPLOAD_BYTES` (default 20 MiB), `APP_ALLOWED_ORIGINS` (JSON list), and `APP_DATASET_TTL_HOURS`. Wildcard CORS origins are rejected because credentials are enabled. The lifespan hook validates writable storage and migrates the metadata database without deleting user data.

Run explicit expiry cleanup with `prooflens-cleanup`. It path-checks each server-owned filename and reports deletion failures; cleanup never runs implicitly during requests.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Real database/storage health |
| POST | `/api/v1/datasets` | Stream and register one CSV/XLSX |
| GET | `/api/v1/datasets/{id}` | Safe metadata |
| GET | `/api/v1/datasets/{id}/schema` | Ready schema profile |
| GET | `/api/v1/datasets/{id}/quality` | Ready quality findings |
| POST | `/api/v1/datasets/{id}/select-sheet` | Select/profile one visible sheet |
| DELETE | `/api/v1/datasets/{id}` | Idempotent contained deletion |
| POST | `/api/v1/analysis/plan` | Validate specification and create Proof Contract |

OpenAPI is served by FastAPI at `/docs` and `/openapi.json`.

## Upload, profiling, and quality definitions

Uploads are byte-limited while streaming, named by the server, opened without following symlinks, and removed on failure. Extensions and content structure are checked. XLSX ZIP entry count and expanded size are bounded; macros, encrypted packages, and embedded objects are rejected. Workbooks are read-only, external links are not followed, and formulas are detected but never evaluated. CSV is UTF-8/BOM only and Polars performs parsing.

Profiles retain original labels while generating stable duplicate-safe column IDs. Missing means null, empty string, or whitespace-only string—not zero, false, `NA`, or `N/A`. Findings cover missing values, normalized exact duplicates, blank/duplicate/whitespace/case-colliding headers, incompatible dominant types, ambiguous/mixed dates, explicit mixed currencies, unevaluated formulas, and IQR outliers. Row references and samples are bounded; values are never logged. No overall quality score is calculated.

Planning is `ready` only after registry, revision, columns, types, aggregations, filters, sorting, and assumptions pass. Bounded unresolved policies yield `needs_clarification`; absent or unusable evidence yields `unanswerable`; recoverable processing failures use `error`/the consistent error envelope. Proof requirements cover dataset/revision, columns, types, missing and duplicate policies, currencies, dates, division by zero, and future independent SQL/Polars agreement. That final requirement deliberately remains `requires_backend_decision` in Phase 4.

## Verification

```bash
ruff check .
ruff format --check .
mypy app
pytest
uvicorn app.main:app
curl http://127.0.0.1:8000/api/v1/health
```

## Security boundary and limitations

Phase 4 is intended for controlled development and qualifier demonstration. It has no authentication/authorization, TLS termination, rate limiting, malware scanner, distributed storage, or production deployment configuration. SQLite is metadata-only. The existing frontend still profiles locally until it is explicitly integrated with this API; privacy copy must not imply otherwise.

Analytical execution, generated SQL/Python, DuckDB, independent Polars result verification, LLM/AI integration, charts, Proof Strength, Refusal Certificates, and exports are intentionally not implemented. The next phase is deterministic DuckDB execution with independent Polars verification.
