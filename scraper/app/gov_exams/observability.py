"""Structured [GOV_EXAM] observability helpers for hybrid paper jobs."""
from __future__ import annotations

from typing import Any

from app.core.logger import get_logger

log = get_logger("gov_exams")

# Canonical event names expected by ops dashboards / log drains.
EVENTS = (
    "job_received",
    "availability_started",
    "availability_completed",
    "selection_started",
    "validation_started",
    "assembly_started",
    "ai_generation_started",
    "ai_generation_failed",
    "python_fallback_started",
    "completed",
)


def gov_exam_log(
    event: str,
    *,
    operation_id: str | None = None,
    job_id: str | None = None,
    correlation_id: str | None = None,
    **fields: Any,
) -> None:
    """Emit a single `[GOV_EXAM] <event>` line with correlation fields.

    Every call includes operation_id / job_id / correlation_id (null when unknown)
    so Edge → Python traces stay joinable.
    """
    payload = {
        "event": f"[GOV_EXAM] {event}",
        "gov_exam_event": event,
        "operation_id": operation_id,
        "job_id": job_id,
        "correlation_id": correlation_id,
        **fields,
    }
    if event.endswith("_failed") or event == "ai_generation_failed":
        log.warning(**payload)
    else:
        log.info(**payload)
