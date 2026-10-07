# ProofLens Phase 4 API contract

All endpoints are under `/api/v1`. JSON uses the field names shown below. Stored paths and stored filenames are never returned.

## Dataset lifecycle

`POST /datasets` accepts exactly one multipart field named `file`. A CSV becomes `ready` after profiling. An XLSX with exactly one usable visible worksheet is selected and profiled automatically. A workbook with multiple usable visible worksheets becomes `awaiting_sheet_selection`; call `POST /datasets/{dataset_id}/select-sheet` with `{"sheet_name":"Orders"}`.

Dataset metadata includes `dataset_id`, `original_filename`, `file_type`, `size_bytes`, `sha256`, `status`, worksheet metadata, row and column counts, `revision`, and UTC lifecycle timestamps. Selecting a sheet increments `revision` without changing `sha256`.

`GET /datasets/{id}/schema` returns stable `column_id` values. These IDs, rather than labels, are referenced by the Analysis Specification. Only this endpoint returns bounded sample values.

## Planning request

```json
{
  "dataset_id": "server dataset UUID",
  "dataset_revision": 1,
  "question": "Which region has the highest total profit?",
  "manual_specification": {
    "version": "1.0",
    "datasetId": "server dataset UUID",
    "question": "Which region has the highest total profit?",
    "metric": {"kind": "column", "column": "profit"},
    "aggregation": "sum",
    "groupBy": ["region"],
    "filters": [],
    "sort": {"target": "metric", "direction": "descending"},
    "limit": 10,
    "requiredColumns": ["profit", "region"],
    "assumptions": ["Keep exact duplicate rows in the analysis input."],
    "createdAt": "2026-10-07T00:00:00Z"
  }
}
```

The embedded specification preserves the Phase 3 camelCase contract. The outer envelope is the authoritative Phase 4 registry reference and does not accept dataset rows or client-supplied schema/quality summaries. Responses use `state`: `ready`, `needs_clarification`, `unanswerable`, or `error`. `ready` only means the contract can proceed to a future execution phase.

## Errors

Errors consistently return `error_code`, a safe `message`, `field_errors`, and `request_id`. Unknown datasets return 404, invalid lifecycle state 409, expired datasets 410, and invalid domain values 422.
