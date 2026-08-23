"""Secure internal Government Exam hybrid-engine endpoints for Edge Functions."""
from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.internal_auth import InternalRequest, require_internal_auth
from app.gov_exams.availability import compute_availability
from app.gov_exams.engine import process_gov_exam_job
from app.gov_exams.observability import gov_exam_log
from app.gov_exams.schemas import (
    AvailabilityRequest,
    AvailabilityResponse,
    ProcessJobRequest,
    ProcessJobResponse,
    SelectRequest,
    SelectResponse,
    ValidateQuestionsRequest,
    ValidateQuestionsResponse,
)
from app.gov_exams.selection import select_questions
from app.gov_exams.validator import validate_question_payloads
from app.paper_factory.config import get_factory_settings
from app.paper_factory.models import PaperFactoryError
from app.paper_factory.repository import PaperRepository

router = APIRouter(prefix="/internal/gov-exams", tags=["gov-exams"])


def _repo() -> PaperRepository:
    return PaperRepository(get_factory_settings())


def _http_error(exc: PaperFactoryError, correlation_id: str | None) -> HTTPException:
    status_map = {
        "EXAM_NOT_FOUND": 404,
        "STAGE_NOT_FOUND": 404,
        "PATTERN_NOT_FOUND": 409,
        "PATTERN_INVALID": 409,
        "EXAM_NOT_APPROVED": 403,
        "CONTENT_INSUFFICIENT": 422,
        "JOB_NOT_FOUND": 404,
        "USER_REQUIRED": 422,
    }
    return HTTPException(
        status_code=status_map.get(exc.code, 500),
        detail={
            "code": exc.code,
            "message": exc.message,
            "retryable": exc.retryable,
            "stage": "gov_exams",
            "correlation_id": correlation_id,
        },
    )


@router.get("/health")
async def health(
    request: InternalRequest = Depends(require_internal_auth),
) -> dict[str, object]:
    """Authenticated health probe for Edge Functions."""
    settings = get_factory_settings()
    return {
        "ok": True,
        "service": "gov-exams",
        "has_ai_provider": settings.has_ai_provider,
        "request_id": request.request_id,
    }


@router.post("/availability", response_model=AvailabilityResponse)
async def availability(
    body: AvailabilityRequest,
    request: InternalRequest = Depends(require_internal_auth),
) -> AvailabilityResponse:
    correlation = body.correlation_id or request.request_id
    operation_id = correlation or str(uuid.uuid4())
    try:
        return await asyncio.to_thread(
            compute_availability,
            _repo(),
            body.model_copy(update={"correlation_id": correlation}),
            operation_id=operation_id,
        )
    except PaperFactoryError as exc:
        raise _http_error(exc, correlation) from exc


@router.post("/select", response_model=SelectResponse)
async def select(
    body: SelectRequest,
    request: InternalRequest = Depends(require_internal_auth),
) -> SelectResponse:
    correlation = body.correlation_id or request.request_id
    operation_id = correlation or str(uuid.uuid4())
    try:
        return await asyncio.to_thread(
            select_questions,
            _repo(),
            body.model_copy(update={"correlation_id": correlation}),
            operation_id=operation_id,
        )
    except PaperFactoryError as exc:
        raise _http_error(exc, correlation) from exc


@router.post("/validate-questions", response_model=ValidateQuestionsResponse)
async def validate_questions(
    body: ValidateQuestionsRequest,
    request: InternalRequest = Depends(require_internal_auth),
) -> ValidateQuestionsResponse:
    correlation = body.correlation_id or request.request_id
    operation_id = correlation or str(uuid.uuid4())
    return validate_question_payloads(
        body.model_copy(update={"correlation_id": correlation}),
        operation_id=operation_id,
    )


@router.post("/process-job", response_model=ProcessJobResponse)
async def process_job(
    body: ProcessJobRequest,
    request: InternalRequest = Depends(require_internal_auth),
) -> ProcessJobResponse:
    correlation = body.correlation_id or request.request_id
    settings = get_factory_settings()
    repo = PaperRepository(settings)

    job = await asyncio.to_thread(repo.get_job, body.job_id)
    if not job:
        gov_exam_log(
            "job_received",
            operation_id=correlation,
            job_id=body.job_id,
            correlation_id=correlation,
            error="JOB_NOT_FOUND",
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "JOB_NOT_FOUND",
                "message": "Unknown gov paper generation job.",
                "retryable": False,
                "stage": "job_lookup",
                "correlation_id": correlation,
            },
        )

    result = await process_gov_exam_job(
        job,
        settings=settings,
        repo=repo,
        correlation_id=correlation,
    )
    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY
            if result.error_code == "CONTENT_INSUFFICIENT"
            else status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": result.error_code or "PAPER_GENERATION_FAILED",
                "message": result.error_message or "Generation failed.",
                "retryable": bool(result.retryable),
                "stage": "process_job",
                "correlation_id": correlation,
                "status": result.status,
            },
        )
    return result
