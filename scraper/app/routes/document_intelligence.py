"""Private document-intelligence job orchestration endpoints."""
from __future__ import annotations

import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.internal_auth import InternalRequest, require_internal_auth
from app.core.security import supabase_admin
from app.document_intelligence.durable_jobs import (
    acknowledge_durable_job,
    fetch_durable_job,
    job_row_to_response,
)
from app.document_intelligence.jobs import registry
from app.document_intelligence.schemas import (
    DurableDocumentJobNotifyRequest,
    ExamSourceJobRequest,
    JobResponse,
    ValidatePaperJobRequest,
)

router = APIRouter(prefix="/internal", tags=["document-intelligence"])

_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.I,
)


def _is_uuid(value: str) -> bool:
    if not _UUID.fullmatch(value):
        return False
    try:
        UUID(value)
    except ValueError:
        return False
    return True


def _retired_admin_job(code: str, message: str, request: InternalRequest) -> None:
    """In-memory exam-source/validate-paper enqueue is retired — no silent success."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail={
            "code": "FUNCTION_RETIRED",
            "message": message,
            "retryable": False,
            "stage": "retired",
            "correlation_id": request.request_id,
            "replacement": code,
        },
    )


@router.post("/jobs/document", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def document_job(
    request: InternalRequest = Depends(require_internal_auth),
    body: DurableDocumentJobNotifyRequest | None = None,
    db: Client = Depends(supabase_admin),
) -> JobResponse:
    """Acknowledge a durable Edge-enqueued document job (PostgreSQL authoritative)."""
    if body is None or not body.job_id.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "REQUEST_VALIDATION_FAILED",
                "message": "job_id, document_id, and owner_id are required.",
                "retryable": False,
                "stage": "validation",
                "correlation_id": request.request_id,
            },
        )
    correlation_id = (body.correlation_id or request.request_id).strip()
    return acknowledge_durable_job(
        db,
        job_id=body.job_id.strip(),
        document_id=body.document_id.strip(),
        owner_id=body.owner_id.strip(),
        correlation_id=correlation_id,
    )


@router.post("/jobs/exam-source", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def exam_source_job(
    request: InternalRequest = Depends(require_internal_auth),
    _body: ExamSourceJobRequest | None = None,
) -> JobResponse:
    _retired_admin_job(
        "POST /scrape/start or Edge extract-question-paper",
        "In-memory exam-source enqueue is retired. Use the scrape pipeline or extract-question-paper.",
        request,
    )
    raise AssertionError("unreachable")


@router.post("/jobs/validate-paper", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def validate_paper_job(
    request: InternalRequest = Depends(require_internal_auth),
    _body: ValidatePaperJobRequest | None = None,
) -> JobResponse:
    _retired_admin_job(
        "POST /internal/gov-exams/validate-questions",
        "In-memory validate-paper enqueue is retired. Use /internal/gov-exams/validate-questions.",
        request,
    )
    raise AssertionError("unreachable")


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str,
    request: InternalRequest = Depends(require_internal_auth),
    db: Client = Depends(supabase_admin),
) -> JobResponse:
    if _is_uuid(job_id):
        try:
            row = fetch_durable_job(db, job_id)
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "JOB_LOOKUP_FAILED",
                    "message": "Durable job lookup is temporarily unavailable.",
                    "retryable": True,
                    "stage": "job_lookup",
                    "correlation_id": request.request_id,
                },
            ) from exc
        if row:
            return job_row_to_response(row, request.request_id)

    job = registry.get(job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "JOB_NOT_FOUND",
                "message": "Processing job was not found.",
                "retryable": False,
                "stage": "job_lookup",
                "correlation_id": request.request_id,
            },
        )
    return job
