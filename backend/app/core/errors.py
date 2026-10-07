from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


class FieldError(BaseModel):
    field: str
    message: str


class ErrorResponse(BaseModel):
    error_code: str
    message: str
    field_errors: list[FieldError] = Field(default_factory=list)
    request_id: str


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        error_code: str,
        message: str,
        field_errors: list[dict[str, str]] | None = None,
    ) -> None:
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.field_errors = field_errors or []


def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    body = ErrorResponse(
        error_code=exc.error_code,
        message=exc.message,
        field_errors=[FieldError(**item) for item in exc.field_errors],
        request_id=getattr(request.state, "request_id", "unknown"),
    )
    return JSONResponse(status_code=exc.status_code, content=body.model_dump())


def unexpected_error_handler(request: Request, _exc: Exception) -> JSONResponse:
    body: dict[str, Any] = ErrorResponse(
        error_code="internal_error",
        message="The service could not process the request.",
        request_id=getattr(request.state, "request_id", "unknown"),
    ).model_dump()
    return JSONResponse(status_code=500, content=body)
