"""Application error hierarchy and the FastAPI exception handler that renders it.

Every AppError becomes a JSON body of the shape {"error": {"code", "message", "detail"}},
which the frontend surfaces through its shared notification interface (FE-017,
`useNotifications().error`). Streaming endpoints deliver the same shape as an SSE
`error` event instead, because the HTTP status/headers are already sent.
"""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    code: str = "internal_error"
    http_status: int = 500

    def __init__(self, message: str, *, detail: Any = None, http_status: int | None = None):
        super().__init__(message)
        self.message = message
        self.detail = detail
        if http_status is not None:
            self.http_status = http_status

    def to_dict(self) -> dict[str, Any]:
        body: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.detail is not None:
            body["detail"] = self.detail
        return body


class BadRequestError(AppError):
    code = "bad_request"
    http_status = 400


class NotConfiguredError(AppError):
    """A provider/tool the request needs has no server-side credentials configured."""

    code = "not_configured"
    http_status = 400


class ProviderError(AppError):
    """An upstream LLM provider returned an error."""

    code = "provider_error"
    http_status = 502


class UpstreamTimeoutError(AppError):
    code = "timeout"
    http_status = 504


class RateLimitError(AppError):
    code = "rate_limit"
    http_status = 429


class PathEscapeError(AppError):
    """A filesystem request tried to escape the allowed workspace root (BE-001)."""

    code = "path_escape"
    http_status = 400


class SubprocessError(AppError):
    """The sa-redteam subprocess failed (BE-007)."""

    code = "subprocess_error"
    http_status = 502


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.http_status, content={"error": exc.to_dict()})


async def unhandled_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    err = AppError(str(exc) or "Unexpected server error")
    return JSONResponse(status_code=err.http_status, content={"error": err.to_dict()})
