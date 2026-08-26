"""PostgreSQL-backed document job lookups for product user flows.

User-facing document jobs are created and credited in Edge/Supabase. Python
acknowledges dispatch and runs the embedded worker against the durable queue —
never an in-process registry.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from supabase import Client

from app.document_intelligence.schemas import JobResponse, JobState


def _parse_state(raw: str | None) -> JobState:
    try:
        return JobState(str(raw or "queued"))
    except ValueError:
        return JobState.QUEUED


def _parse_ts(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)


def job_row_to_response(row: dict[str, Any], correlation_id: str) -> JobResponse:
    """Map a document_processing_jobs row to the hybrid JobResponse envelope."""
    return JobResponse(
        success=True,
        job_id=str(row["id"]),
        state=_parse_state(row.get("status")),
        result_reference=row.get("result_reference"),
        warnings=row.get("warnings") or [],
        correlation_id=correlation_id,
        error=None,
        attempt_count=int(row.get("attempt_count") or 0),
        max_attempts=int(row.get("max_attempts") or 3),
        created_at=_parse_ts(row.get("created_at")),
        updated_at=_parse_ts(row.get("updated_at")),
    )


def fetch_durable_job(db: Client, job_id: str) -> dict[str, Any] | None:
    response = (
        db.from_("document_processing_jobs")
        .select(
            "id, document_id, owner_id, operation, status, result_reference, warnings, "
            "error_code, error_message, error_stage, retryable, attempt_count, max_attempts, "
            "created_at, updated_at, completed_at, storage_reference"
        )
        .eq("id", job_id)
        .maybe_single()
        .execute()
    )
    if getattr(response, "error", None):
        raise RuntimeError(f"document job lookup failed: {response.error}")
    data = response.data
    return data if isinstance(data, dict) else None


def acknowledge_durable_job(
    db: Client,
    *,
    job_id: str,
    document_id: str,
    owner_id: str,
    correlation_id: str,
) -> JobResponse:
    """Verify Edge-enqueued durable job and return authoritative DB state."""
    row = fetch_durable_job(db, job_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "JOB_NOT_FOUND",
                "message": "Processing job was not found in the durable queue.",
                "retryable": False,
                "stage": "job_lookup",
                "correlation_id": correlation_id,
            },
        )
    if str(row.get("document_id")) != document_id or str(row.get("owner_id")) != owner_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "JOB_OWNERSHIP_MISMATCH",
                "message": "Job identifiers do not match the durable record.",
                "retryable": False,
                "stage": "ownership",
                "correlation_id": correlation_id,
            },
        )
    return job_row_to_response(row, correlation_id)
