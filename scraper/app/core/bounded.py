"""Bounded waits so a slow Supabase/JWKS call cannot hang request workers."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable
from typing import TypeVar

from fastapi import HTTPException

T = TypeVar("T")

# Edge pythonGovExamClient DEFAULT_TIMEOUT_MS is 25s; finish inside that budget.
GOV_EXAM_DB_TIMEOUT_SECONDS = 20.0
# Edge PROCESS_JOB_TIMEOUT_MS is 8s; claim/lookup must return first.
GOV_EXAM_CLAIM_TIMEOUT_SECONDS = 5.0
ADMIN_AUTH_TIMEOUT_SECONDS = 5.0
SUPABASE_HTTP_TIMEOUT_SECONDS = 20.0


def upstream_timeout_error(
    *,
    code: str = "UPSTREAM_TIMEOUT",
    message: str = "Upstream lookup timed out.",
    stage: str = "db",
    correlation_id: str | None = None,
) -> HTTPException:
    return HTTPException(
        status_code=504,
        detail={
            "code": code,
            "message": message,
            "retryable": True,
            "stage": stage,
            "correlation_id": correlation_id,
        },
    )


async def await_bounded(
    awaitable: Awaitable[T],
    timeout_seconds: float,
    *,
    code: str = "UPSTREAM_TIMEOUT",
    message: str = "Upstream lookup timed out.",
    stage: str = "db",
    correlation_id: str | None = None,
) -> T:
    try:
        return await asyncio.wait_for(awaitable, timeout=timeout_seconds)
    except TimeoutError as exc:
        raise upstream_timeout_error(
            code=code,
            message=message,
            stage=stage,
            correlation_id=correlation_id,
        ) from exc
