"""HMAC authentication for private service-to-service endpoints."""
from __future__ import annotations

import hashlib
import hmac
import re
import time
from dataclasses import dataclass
from threading import Lock

from fastapi import Depends, Header, HTTPException, Request, status

from app.core.config import Settings, get_settings, is_production_app_env

_REQUEST_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$")


@dataclass(frozen=True)
class InternalRequest:
    request_id: str
    timestamp: int
    body_digest: str


class ReplayGuard:
    def __init__(self) -> None:
        self._entries: dict[str, tuple[float, str]] = {}
        self._lock = Lock()

    def check_and_record(self, request_id: str, fingerprint: str, ttl: int) -> bool:
        now = time.time()
        with self._lock:
            self._entries = {
                key: value for key, value in self._entries.items() if value[0] > now
            }
            existing = self._entries.get(request_id)
            if existing:
                return hmac.compare_digest(existing[1], fingerprint)
            self._entries[request_id] = (now + ttl, fingerprint)
            return True


replay_guard = ReplayGuard()


def _failure(code: str, message: str, *, status_code: int = 401) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={
            "code": code,
            "message": message,
            "retryable": code in {"AUTH_TIMESTAMP_OUT_OF_RANGE", "AUTH_REPLAY"},
            "stage": "authentication",
            "correlation_id": None,
        },
    )


async def require_internal_auth(
    request: Request,
    x_internal_timestamp: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None),
    x_internal_signature: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> InternalRequest:
    """Validate timestamped HMAC over method, path, request id and body digest."""
    if not x_internal_timestamp or not x_request_id or not x_internal_signature:
        raise _failure("AUTH_REQUIRED", "Internal authentication headers are required.")
    if not _REQUEST_ID.fullmatch(x_request_id):
        raise _failure("AUTH_REQUEST_ID_INVALID", "Request ID format is invalid.")
    try:
        timestamp = int(x_internal_timestamp)
    except ValueError as exc:
        raise _failure("AUTH_TIMESTAMP_INVALID", "Authentication timestamp is invalid.") from exc

    now = int(time.time())
    if abs(now - timestamp) > settings.internal_auth_max_skew_seconds:
        raise _failure("AUTH_TIMESTAMP_OUT_OF_RANGE", "Authentication timestamp is outside the allowed window.")

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > settings.internal_max_request_bytes:
                raise _failure("REQUEST_TOO_LARGE", "Request body exceeds the internal size limit.", status_code=413)
        except ValueError as exc:
            raise _failure("REQUEST_LENGTH_INVALID", "Request content length is invalid.", status_code=400) from exc

    body = await request.body()
    if len(body) > settings.internal_max_request_bytes:
        raise _failure("REQUEST_TOO_LARGE", "Request body exceeds the internal size limit.", status_code=413)
    body_digest = hashlib.sha256(body).hexdigest()
    message = "\n".join(
        (request.method.upper(), request.url.path, str(timestamp), x_request_id, body_digest)
    ).encode()
    provided = x_internal_signature.removeprefix("sha256=")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", provided):
        raise _failure("AUTH_SIGNATURE_INVALID", "Authentication signature is invalid.")

    secrets = [settings.internal_auth_secret]
    if settings.internal_auth_previous_secret:
        secrets.append(settings.internal_auth_previous_secret)
    if not any(hmac.compare_digest(
        hmac.new(secret.encode(), message, hashlib.sha256).hexdigest(), provided
    ) for secret in secrets):
        raise _failure("AUTH_SIGNATURE_INVALID", "Authentication signature is invalid.")

    fingerprint = f"{timestamp}:{body_digest}:{provided.lower()}"
    if not replay_guard.check_and_record(
        x_request_id, fingerprint, settings.internal_auth_replay_ttl_seconds
    ):
        raise _failure("AUTH_REPLAY", "Request ID has already been used with different content.", status_code=409)
    return InternalRequest(x_request_id, timestamp, body_digest)


async def require_observability_auth(
    request: Request,
    x_metrics_token: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
    x_internal_timestamp: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None),
    x_internal_signature: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    """Gate /metrics and /alerts in production (HMAC or METRICS_AUTH_TOKEN)."""
    if not is_production_app_env(settings.app_env):
        return

    expected = settings.metrics_auth_token.strip()
    provided = (x_metrics_token or "").strip()
    if not provided and authorization and authorization.lower().startswith("bearer "):
        provided = authorization.split(" ", 1)[1].strip()
    if (
        expected
        and provided
        and len(provided) == len(expected)
        and hmac.compare_digest(provided, expected)
    ):
        return

    await require_internal_auth(
        request,
        x_internal_timestamp,
        x_request_id,
        x_internal_signature,
        settings,
    )
