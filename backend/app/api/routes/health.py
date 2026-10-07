import os
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel

from app import __version__

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok", "unavailable"]
    application_version: str
    api_version: str
    environment: str
    database: Literal["available", "unavailable"]
    dataset_storage: Literal["available", "unavailable"]


@router.get("/health", response_model=HealthResponse)
def health(request: Request, response: Response) -> HealthResponse:
    database_ok = request.app.state.database.check()
    try:
        data_dir = request.app.state.settings.data_dir
        probe = data_dir / f".health-{uuid4().hex}"
        descriptor = os.open(probe, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(descriptor)
        probe.unlink()
        storage_ok = True
    except OSError:
        storage_ok = False
    healthy = database_ok and storage_ok
    if not healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthResponse(
        status="ok" if healthy else "unavailable",
        application_version=__version__,
        api_version="v1",
        environment=request.app.state.settings.env,
        database="available" if database_ok else "unavailable",
        dataset_storage="available" if storage_ok else "unavailable",
    )
