import os
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.responses import Response

from app import __version__
from app.api.routes import health, workspaces
from app.core.config import Settings, get_settings
from app.core.errors import AppError, ErrorResponse, app_error_handler, unexpected_error_handler
from app.core.logging import configure_logging, log_event


def create_app(settings: Settings | None = None) -> FastAPI:
    configuration = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        configuration.data_dir.mkdir(parents=True, exist_ok=True)
        probe = configuration.data_dir / f".write-test-{uuid4().hex}"
        try:
            descriptor = os.open(probe, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            os.close(descriptor)
        finally:
            probe.unlink(missing_ok=True)
        (configuration.data_dir / "workspaces").mkdir(exist_ok=True)
        app.state.settings = configuration
        yield

    configure_logging(configuration.log_level)
    app = FastAPI(
        title="ProofLens API",
        version=__version__,
        description=(
            "Proof-carrying data analyst: every number ships with a re-runnable, "
            "hash-pinned proof script, or a refusal certificate."
        ),
        lifespan=lifespan,
        responses={422: {"model": ErrorResponse}},
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=configuration.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Accept", "Content-Type", "X-Request-ID"],
    )

    @app.middleware("http")
    async def security_and_logging(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get("x-request-id", str(uuid4()))[:128]
        request.state.request_id = request_id
        if request.url.path.endswith("/files") and request.method == "POST":
            content_length = request.headers.get("content-length")
            if (
                content_length
                and content_length.isdigit()
                and int(content_length) > configuration.max_upload_bytes + 65_536
            ):
                return app_error_handler(
                    request,
                    AppError(
                        413, "request_too_large", "The upload request exceeds the configured limit."
                    ),
                )
        started = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Request-ID"] = request_id
        route = request.scope.get("route")
        log_event(
            "http_request",
            request_id=request_id,
            method=request.method,
            route=getattr(route, "path", request.url.path),
            status_code=response.status_code,
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
        )
        return response

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return app_error_handler(request, exc)

    @app.exception_handler(RequestValidationError)
    async def handle_validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        field_errors = []
        for error in exc.errors():
            path = ".".join(str(item) for item in error["loc"] if item != "body")
            field_errors.append({"field": path, "message": str(error["msg"])})
        return app_error_handler(
            request,
            AppError(422, "request_validation_error", "The request is invalid.", field_errors),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        log_event(
            "unexpected_error", request_id=request.state.request_id, error_type=type(exc).__name__
        )
        return unexpected_error_handler(request, exc)

    app.include_router(health.router, prefix="/api/v1")
    app.include_router(workspaces.router, prefix="/api/v1")
    return app


app = create_app()
