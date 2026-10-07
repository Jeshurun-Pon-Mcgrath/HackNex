from typing import Any

from fastapi.testclient import TestClient
from openpyxl import Workbook


def upload_csv(client: TestClient, content: bytes) -> dict[str, Any]:
    response = client.post("/api/v1/datasets", files={"file": ("sales.csv", content, "text/csv")})
    assert response.status_code == 201, response.text
    return response.json()


def specification(dataset: dict[str, Any], column: str = "profit") -> dict[str, Any]:
    return {
        "version": "1.0",
        "datasetId": dataset["dataset_id"],
        "question": "What is total profit?",
        "metric": {"kind": "column", "column": column},
        "aggregation": "sum",
        "groupBy": [],
        "filters": [],
        "sort": {"target": "metric", "direction": "descending"},
        "limit": 1,
        "requiredColumns": [column],
        "assumptions": [],
        "createdAt": "2026-10-07T00:00:00Z",
    }


def test_health_openapi_and_csv_lifecycle(client: TestClient, csv_bytes: bytes) -> None:
    health = client.get("/api/v1/health")
    assert health.status_code == 200
    assert health.json()["database"] == "available"
    assert client.get("/openapi.json").status_code == 200

    dataset = upload_csv(client, csv_bytes)
    assert dataset["status"] == "ready"
    assert len(dataset["sha256"]) == 64
    assert "stored_filename" not in dataset
    schema = client.get(f"/api/v1/datasets/{dataset['dataset_id']}/schema")
    assert schema.status_code == 200
    assert schema.json()["row_count"] == 3
    quality = client.get(f"/api/v1/datasets/{dataset['dataset_id']}/quality")
    assert quality.status_code == 200

    deleted = client.delete(f"/api/v1/datasets/{dataset['dataset_id']}")
    assert deleted.status_code == 204
    assert client.delete(f"/api/v1/datasets/{dataset['dataset_id']}").status_code == 204
    assert client.get(f"/api/v1/datasets/{dataset['dataset_id']}").status_code == 404


def test_multi_sheet_selection(client: TestClient, multi_sheet_xlsx: bytes) -> None:
    response = client.post(
        "/api/v1/datasets",
        files={
            "file": (
                "book.xlsx",
                multi_sheet_xlsx,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert response.status_code == 201, response.text
    dataset = response.json()
    assert dataset["status"] == "awaiting_sheet_selection"
    assert client.get(f"/api/v1/datasets/{dataset['dataset_id']}/schema").status_code == 409
    selected = client.post(
        f"/api/v1/datasets/{dataset['dataset_id']}/select-sheet", json={"sheet_name": "Orders"}
    )
    assert selected.status_code == 200
    assert selected.json()["selected_sheet"] == "Orders"
    assert selected.json()["revision"] == 2
    assert (
        client.post(
            f"/api/v1/datasets/{dataset['dataset_id']}/select-sheet", json={"sheet_name": "Hidden"}
        ).status_code
        == 422
    )


def test_invalid_uploads_have_safe_errors(client: TestClient) -> None:
    unsupported = client.post(
        "/api/v1/datasets", files={"file": ("x.pdf", b"%PDF", "application/pdf")}
    )
    assert unsupported.status_code == 415
    assert set(unsupported.json()) == {"error_code", "message", "field_errors", "request_id"}
    empty = client.post("/api/v1/datasets", files={"file": ("empty.csv", b"", "text/csv")})
    assert empty.status_code == 422
    corrupt = client.post(
        "/api/v1/datasets", files={"file": ("bad.xlsx", b"not zip", "application/octet-stream")}
    )
    assert corrupt.status_code == 422


def test_bom_duplicate_headers_and_path_filename(client: TestClient) -> None:
    response = client.post(
        "/api/v1/datasets",
        files={"file": ("../unsafe.csv", b"\xef\xbb\xbfa,a\n1,2\n", "text/csv")},
    )
    assert response.status_code == 201
    dataset = response.json()
    assert dataset["original_filename"] == "unsafe.csv"
    schema = client.get(f"/api/v1/datasets/{dataset['dataset_id']}/schema").json()
    assert [item["column_id"] for item in schema["columns"]] == ["a", "a__2"]
    quality = client.get(f"/api/v1/datasets/{dataset['dataset_id']}/quality").json()
    assert any(item["check_type"] == "duplicate_header" for item in quality["findings"])


def test_unsupported_encoding_malformed_and_oversized(client: TestClient) -> None:
    encoding = client.post(
        "/api/v1/datasets",
        files={"file": ("latin.csv", "name\nJos\u00e9\n".encode("latin-1"), "text/csv")},
    )
    assert encoding.status_code == 422
    malformed = client.post(
        "/api/v1/datasets",
        files={"file": ("ragged.csv", b"a,b\n1,2,3\n", "text/csv")},
    )
    assert malformed.status_code == 422
    oversized = client.post(
        "/api/v1/datasets",
        files={"file": ("large.csv", b"a\n" + b"1\n" * 600_000, "text/csv")},
    )
    assert oversized.status_code == 413


def test_single_sheet_formula_is_not_evaluated(client: TestClient, tmp_path: Any) -> None:
    path = tmp_path / "formula.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Data"
    sheet.append(["amount", "calculated"])
    sheet.append([2, "=A2*2"])
    workbook.save(path)
    response = client.post(
        "/api/v1/datasets",
        files={
            "file": (
                "formula.xlsx",
                path.read_bytes(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert response.status_code == 201, response.text
    dataset = response.json()
    assert dataset["status"] == "ready"
    assert dataset["selected_sheet"] == "Data"
    quality = client.get(f"/api/v1/datasets/{dataset['dataset_id']}/quality").json()
    assert any(item["check_type"] == "formula_cells" for item in quality["findings"])


def test_health_reports_database_failure(client: TestClient) -> None:
    client.app.state.database.close()
    response = client.get("/api/v1/health")
    assert response.status_code == 503
    assert response.json()["database"] == "unavailable"


def test_analysis_planning_states(client: TestClient, csv_bytes: bytes) -> None:
    dataset = upload_csv(client, csv_bytes)
    body = {
        "dataset_id": dataset["dataset_id"],
        "dataset_revision": 1,
        "question": "What is total profit?",
        "manual_specification": specification(dataset),
    }
    ready = client.post("/api/v1/analysis/plan", json=body)
    assert ready.status_code == 200, ready.text
    assert ready.json()["state"] == "ready"
    assert (
        ready.json()["proof_contract"]["requirements"][-1]["state"] == "requires_backend_decision"
    )

    bad_revision = client.post("/api/v1/analysis/plan", json={**body, "dataset_revision": 99})
    assert bad_revision.status_code == 409
    absent = specification(dataset, "not_real")
    unanswerable = client.post(
        "/api/v1/analysis/plan", json={**body, "manual_specification": absent}
    )
    assert unanswerable.status_code == 200
    assert unanswerable.json()["state"] == "unanswerable"
    rows_not_allowed = client.post(
        "/api/v1/analysis/plan", json={**body, "rows": [{"secret": "value"}]}
    )
    assert rows_not_allowed.status_code == 422
    bad_version = specification(dataset)
    bad_version["version"] = "2.0"
    assert (
        client.post(
            "/api/v1/analysis/plan", json={**body, "manual_specification": bad_version}
        ).status_code
        == 422
    )


def test_needs_clarification_for_missing_values_and_duplicates(client: TestClient) -> None:
    dataset = upload_csv(client, b"value\n1\n\n1\n1\n")
    spec = specification(dataset, "value")
    body = {
        "dataset_id": dataset["dataset_id"],
        "dataset_revision": 1,
        "question": spec["question"],
        "manual_specification": spec,
    }
    response = client.post("/api/v1/analysis/plan", json=body)
    assert response.status_code == 200
    assert response.json()["state"] == "needs_clarification"
