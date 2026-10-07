from fastapi.testclient import TestClient


def test_demo_workspace_upload_and_bundle(client: TestClient) -> None:
    created = client.post("/api/v1/workspaces/demo")
    assert created.status_code == 201
    body = created.json()
    assert {t["name"] for t in body["tables"]} >= {"orders.csv", "customers.xlsx[Customers]"}
    assert any(f["kind"] == "mixed_currency" for f in body["findings"])
    workspace_id = body["workspace_id"]

    uploaded = client.post(
        f"/api/v1/workspaces/{workspace_id}/files",
        files={"file": ("extra.csv", b"id,value\n1,10\n2,20\n", "text/csv")},
    )
    assert uploaded.status_code == 201
    assert "extra.csv" in {t["name"] for t in uploaded.json()["tables"]}

    rejected = client.post(
        f"/api/v1/workspaces/{workspace_id}/files",
        files={"file": ("x.exe", b"MZ", "application/octet-stream")},
    )
    assert rejected.status_code == 415

    assert client.get(f"/api/v1/workspaces/{workspace_id}/runs").json() == []
    kit = client.get(f"/api/v1/workspaces/{workspace_id}/bundle.zip")
    assert kit.status_code == 200 and kit.content[:2] == b"PK"


def test_unknown_workspace_and_health(client: TestClient) -> None:
    assert client.get("/api/v1/workspaces/" + "0" * 32).status_code == 404
    assert client.get("/api/v1/workspaces/not-a-workspace").status_code == 404
    assert client.get("/api/v1/health").json()["storage"] == "available"
