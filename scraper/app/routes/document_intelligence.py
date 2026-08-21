"""Private document-intelligence job orchestration endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.internal_auth import InternalRequest, require_internal_auth
from app.document_intelligence.jobs import registry
from app.document_intelligence.schemas import (
    DocumentJobRequest,
    ExamSourceJobRequest,
    JobResponse,
    ValidatePaperJobRequest,
)

router = APIRouter(prefix="/internal", tags=["document-intelligence"])


def _enqueue(operation: str, request: InternalRequest) -> JobResponse:
    return registry.create(operation, request.request_id)


@router.post("/jobs/document", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def document_job(
    request: InternalRequest = Depends(require_internal_auth),
    _body: DocumentJobRequest | None = None,
) -> JobResponse:
    return _enqueue("document", request)


@router.post("/jobs/exam-source", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def exam_source_job(
    request: InternalRequest = Depends(require_internal_auth),
    _body: ExamSourceJobRequest | None = None,
) -> JobResponse:
    return _enqueue("exam-source", request)


@router.post("/jobs/validate-paper", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def validate_paper_job(
    request: InternalRequest = Depends(require_internal_auth),
    _body: ValidatePaperJobRequest | None = None,
) -> JobResponse:
    return _enqueue("validate-paper", request)


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str,
    _request: InternalRequest = Depends(require_internal_auth),
) -> JobResponse:
    job = registry.get(job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "JOB_NOT_FOUND",
                "message": "Processing job was not found.",
                "retryable": False,
                "stage": "job_lookup",
                "correlation_id": _request.request_id,
            },
        )
    return job
