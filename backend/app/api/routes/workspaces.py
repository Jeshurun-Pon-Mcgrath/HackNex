import json
from collections.abc import Iterator
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, File, Request, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from app.agent import bundle, pipeline, sandbox, workspace
from app.agent.llm import LLM
from app.agent.scan import scan
from app.core.config import Settings
from app.core.errors import AppError
from app.core.logging import log_event
from app.core.security import workspace_dir

router = APIRouter(prefix="/workspaces", tags=["workspaces"])
DEMO_DIR = Path(__file__).resolve().parents[4] / "demo"
DEMO_FILES = ["orders.csv", "customers.xlsx", "policy.md"]


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)


class AdoptRequest(BaseModel):
    index: int = Field(ge=1, le=4)


def _settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def _summary(settings: Settings, workspace_id: str) -> dict[str, Any]:
    ws = workspace.load(settings.data_dir, workspace_id)
    return {
        "workspace_id": workspace_id,
        "files": [{"name": n, "sha256": h} for n, h in ws.hashes.items()],
        "tables": [
            {
                "name": t.name,
                "file": t.file,
                "load": t.load,
                "rows": len(t.raw),
                "columns": [{"name": str(c), "dtype": t.dtypes.get(c, "")} for c in t.raw.columns],
                "preview": t.raw.head(8).to_dict("records"),
            }
            for t in ws.tables
        ],
        "documents": [{"name": n, "excerpt": text[:600]} for n, text in ws.documents.items()],
        "findings": [f.dict() for f in scan(ws.tables)],
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_workspace(request: Request) -> dict[str, Any]:
    settings = _settings(request)
    return _summary(settings, workspace.create(settings.data_dir))


@router.post("/demo", status_code=status.HTTP_201_CREATED)
def create_demo(request: Request) -> dict[str, Any]:
    settings = _settings(request)
    workspace_id = workspace.create(settings.data_dir)
    target = workspace_dir(settings.data_dir, workspace_id)
    for name in DEMO_FILES:
        (target / name).write_bytes((DEMO_DIR / name).read_bytes())
    return _summary(settings, workspace_id)


@router.get("/{workspace_id}")
def get_workspace(workspace_id: str, request: Request) -> dict[str, Any]:
    return _summary(_settings(request), workspace_id)


@router.post("/{workspace_id}/files", status_code=status.HTTP_201_CREATED)
async def upload_file(
    workspace_id: str, request: Request, file: Annotated[UploadFile, File()]
) -> dict[str, Any]:
    settings = _settings(request)
    path = workspace_dir(settings.data_dir, workspace_id)
    name = await workspace.save_upload(path, file, settings.max_upload_bytes)
    try:
        summary = _summary(settings, workspace_id)
    except AppError:
        (path / name).unlink(missing_ok=True)
        raise
    log_event("file_uploaded", workspace_id=workspace_id, file=name)
    return summary


@router.delete("/{workspace_id}/files/{name}")
def delete_file(workspace_id: str, name: str, request: Request) -> dict[str, Any]:
    settings = _settings(request)
    path = workspace_dir(settings.data_dir, workspace_id)
    target = path / Path(name).name
    if target.parent != path or not target.is_file():
        raise AppError(404, "file_not_found", "The file was not found.")
    target.unlink()
    return _summary(settings, workspace_id)


@router.post("/{workspace_id}/ask")
def ask(workspace_id: str, body: AskRequest, request: Request) -> StreamingResponse:
    settings = _settings(request)
    ws = workspace.load(settings.data_dir, workspace_id)
    if not ws.tables:
        raise AppError(422, "no_tables", "Upload at least one CSV or XLSX table first.")
    agent = pipeline.Agent(
        LLM(settings.ollama_url, settings.ollama_model, settings.llm_timeout_seconds),
        settings.script_timeout_seconds,
    )

    def stream() -> Iterator[str]:
        try:
            for event in agent.ask(ws, body.question.strip()):
                yield json.dumps(event, default=str) + "\n"
        except AppError as exc:
            yield (
                json.dumps({"type": "error", "error_code": exc.error_code, "message": exc.message})
                + "\n"
            )

    return StreamingResponse(stream(), media_type="application/x-ndjson")


@router.get("/{workspace_id}/runs")
def list_runs(workspace_id: str, request: Request) -> list[dict[str, Any]]:
    return pipeline.load_runs(workspace_dir(_settings(request).data_dir, workspace_id))


def _run(path: Path, run_id: str) -> dict[str, Any]:
    run = next((r for r in pipeline.load_runs(path) if r["id"] == run_id), None)
    if run is None:
        raise AppError(404, "run_not_found", "The run was not found.")
    return run


@router.post("/{workspace_id}/runs/{run_id}/rerun")
def rerun(workspace_id: str, run_id: str, request: Request) -> dict[str, Any]:
    """Independently re-execute every stored proof script and compare to the claimed values."""
    settings = _settings(request)
    path = workspace_dir(settings.data_dir, workspace_id)
    run = _run(path, run_id)
    results = []
    for interp in run["interpretations"]:
        if not interp.get("ok"):
            continue
        result = sandbox.run(interp["script"], path, settings.script_timeout_seconds)
        results.append(
            {
                "index": interp["index"],
                "label": interp["label"],
                "claimed": interp["value"],
                "reproduced": result.value,
                "match": result.ok and sandbox.same(interp["value"], result.value),
                "error": result.error,
            }
        )
    return {"run_id": run_id, "results": results}


@router.post("/{workspace_id}/runs/{run_id}/adopt")
def adopt(workspace_id: str, run_id: str, body: AdoptRequest, request: Request) -> dict[str, Any]:
    """User resolves an ambiguous run by choosing one interpretation."""
    path = workspace_dir(_settings(request).data_dir, workspace_id)
    run = _run(path, run_id)
    chosen = next(
        (i for i in run["interpretations"] if i["index"] == body.index and i.get("ok")), None
    )
    if run["status"] != "ambiguous" or chosen is None:
        raise AppError(
            422,
            "cannot_adopt",
            "Only a successful interpretation of an ambiguous run can be adopted.",
        )
    run.update(
        status="answered",
        answer=chosen["value"],
        display=chosen["display"],
        adopted=body.index,
        explanation=f"Answer under the user-confirmed assumption: {chosen['label']}.",
    )
    pipeline.save_run(path, run)
    return run


@router.get("/{workspace_id}/bundle.zip")
def download_bundle(workspace_id: str, request: Request) -> Response:
    path = workspace_dir(_settings(request).data_dir, workspace_id)
    return Response(
        bundle.build(path, pipeline.load_runs(path)),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="prooflens-proof-kit.zip"'},
    )
