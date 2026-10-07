# ProofLens — Current Implementation

This repository currently contains:

- A React frontend for local CSV/XLSX inspection, deterministic data-quality reporting, manual Analysis Specification creation, and Proof Contract preview.
- A FastAPI backend for secure CSV/XLSX ingestion, SQLite dataset registration, server-side schema and quality profiling, worksheet selection, dataset deletion and expiry cleanup, Analysis Specification validation, and deterministic Proof Contract generation.

The frontend and backend currently run as separate applications. Dataset inspection in the frontend remains browser-local; backend behavior can be exercised through its API and Swagger interface.

## Install dependencies

### Requirements

- Node.js with npm
- Python 3.12

### Frontend

From the repository root:

```powershell
cd frontend
npm install
```

### Backend

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
```

## Configure and run the system

### Backend configuration

Create the local backend environment file:

```powershell
cd backend
Copy-Item .env.example .env
```

The supplied development configuration is:

```dotenv
APP_ENV=development
APP_HOST=127.0.0.1
APP_PORT=8000
APP_LOG_LEVEL=INFO
APP_DATA_DIR=./data
APP_DATABASE_PATH=./data/prooflens.sqlite3
APP_MAX_UPLOAD_BYTES=20971520
APP_ALLOWED_ORIGINS=["http://localhost:5173"]
APP_DATASET_TTL_HOURS=24
```

Start the backend from `backend` with the virtual environment activated:

```powershell
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The backend is then available at:

- API: `http://127.0.0.1:8000/api/v1`
- Swagger UI: `http://127.0.0.1:8000/docs`
- OpenAPI document: `http://127.0.0.1:8000/openapi.json`

### Frontend configuration

The current frontend dataset and quality workflow runs locally in the browser and does not require an API URL.

Start it in a second terminal:

```powershell
cd frontend
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`.

## Reproduce the demonstrated results

### 1. Verify the frontend

```powershell
cd frontend
npm run lint
npm run format:check
npm run test -- --run
npm run build
```

To reproduce the browser workflow:

1. Run `npm run dev`.
2. Open the Vite URL.
3. Upload a UTF-8 `.csv` or `.xlsx` file no larger than 20 MB.
4. For a workbook with multiple worksheets, select one worksheet.
5. Review the generated dataset summary, schema, preview, and deterministic quality findings.
6. Open the analysis workspace and create a manual Analysis Specification using the available metric, aggregation, grouping, filtering, sorting, and assumption controls.
7. Review the generated specification JSON and Proof Contract preview.

### 2. Verify the backend

With the backend virtual environment activated:

```powershell
cd backend
ruff check .
ruff format --check .
mypy app
pytest
```

The implemented automated suite currently reports 14 passing tests.

### 3. Reproduce backend health and OpenAPI results

Start the backend, then run:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health
Invoke-RestMethod http://127.0.0.1:8000/openapi.json
```

For a correctly configured local instance, the health response reports `status: ok`, application version `0.4.0`, API version `v1`, and available database and dataset storage.

### 4. Reproduce dataset ingestion and profiling

The simplest interactive method is Swagger UI:

1. Open `http://127.0.0.1:8000/docs`.
2. Use `POST /api/v1/datasets` to upload one UTF-8 CSV or XLSX file.
3. Copy the returned `dataset_id`.
4. If the response state is `awaiting_sheet_selection`, call `POST /api/v1/datasets/{dataset_id}/select-sheet` with a visible worksheet name.
5. Call `GET /api/v1/datasets/{dataset_id}` for safe metadata.
6. Call `GET /api/v1/datasets/{dataset_id}/schema` for the schema profile.
7. Call `GET /api/v1/datasets/{dataset_id}/quality` for deterministic quality findings.
8. Call `DELETE /api/v1/datasets/{dataset_id}` to remove the registered dataset and its stored file.

Accepted files receive an opaque dataset identifier, a server-generated storage name, and a SHA-256 hash of the exact uploaded bytes. Metadata is stored in SQLite separately from uploaded file contents.

### 5. Reproduce analysis planning

After uploading a dataset and obtaining its current revision and schema column IDs, use `POST /api/v1/analysis/plan` in Swagger UI with:

```json
{
  "dataset_id": "DATASET_ID",
  "dataset_revision": 1,
  "question": "What is the total amount?",
  "manual_specification": {
    "version": "1.0",
    "datasetId": "DATASET_ID",
    "question": "What is the total amount?",
    "metric": {
      "kind": "column",
      "column": "amount"
    },
    "aggregation": "sum",
    "groupBy": [],
    "filters": [],
    "sort": {
      "target": "metric",
      "direction": "descending"
    },
    "limit": 1,
    "requiredColumns": ["amount"],
    "assumptions": [],
    "createdAt": "2026-10-07T00:00:00Z"
  }
}
```

Replace `DATASET_ID`, `dataset_revision`, and `amount` with values returned by the dataset and schema endpoints. The response deterministically reports whether the registered dataset and specification are `ready`, `needs_clarification`, or `unanswerable`, together with the applicable Proof Contract.
