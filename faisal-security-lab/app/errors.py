"""Typed errors with stable machine codes and HTTP status mapping."""
from __future__ import annotations


class AppError(Exception):
    code = "error"
    status = 400

    def __init__(self, message: str, *, code: str | None = None, status: int | None = None,
                 detail: dict | None = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        if status:
            self.status = status
        self.detail = detail or {}

    def public(self) -> dict:
        return {"error": {"code": self.code, "message": self.message, "detail": self.detail}}


class ValidationError(AppError):
    code = "validation_error"
    status = 400


class AuthError(AppError):
    code = "unauthenticated"
    status = 401


class ForbiddenError(AppError):
    code = "forbidden"
    status = 403


class NotFoundError(AppError):
    code = "not_found"
    status = 404


class ConflictError(AppError):
    code = "conflict"
    status = 409


class RateLimitError(AppError):
    code = "rate_limited"
    status = 429


class PolicyDenied(ForbiddenError):
    code = "policy_denied"
    status = 403


class ConfigError(ValidationError):
    code = "config_error"


class ConnectorError(AppError):
    code = "connector_error"
    status = 502


class ToolUnavailable(ConnectorError):
    code = "tool_unavailable"
    status = 503


class TimeoutError_(ConnectorError):   # trailing underscore avoids shadowing builtin
    code = "timeout"
    status = 504
