import os
from typing import Literal
from uuid import uuid4

import httpx
from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel

from app import __version__

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded", "unavailable"]
    application_version: str
    api_version: str
    environment: str
    storage: Literal["available", "unavailable"]
    llm: Literal["available", "model_missing", "unavailable"]
    model: str


@router.get("/health", response_model=HealthResponse)
def health(request: Request, response: Response) -> HealthResponse:
    settings = request.app.state.settings
    try:
        probe = settings.data_dir / f".health-{uuid4().hex}"
        os.close(os.open(probe, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600))
        probe.unlink()
        storage_ok = True
    except OSError:
        storage_ok = False
    llm: Literal["available", "model_missing", "unavailable"]
    try:
        tags = httpx.get(f"{settings.ollama_url.rstrip('/')}/api/tags", timeout=3).json()
        names = {m.get("name") for m in tags.get("models", [])}
        llm = "available" if settings.ollama_model in names else "model_missing"
    except (httpx.HTTPError, ValueError):
        llm = "unavailable"
    if not storage_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthResponse(
        status="unavailable" if not storage_ok else "ok" if llm == "available" else "degraded",
        application_version=__version__,
        api_version="v1",
        environment=settings.env,
        storage="available" if storage_ok else "unavailable",
        llm=llm,
        model=settings.ollama_model,
    )
