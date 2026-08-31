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
    BuildPaperRequest,
    BuildPaperResponse,
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

# Keep a strong reference so ack-and-poll process-job work is not GC'd.
_background_jobs: set[asyncio.Task[object]] = set()


def _spawn_process(coro: object) -> None:
    task = asyncio.create_task(coro)  # type: ignore[arg-type]
    _background_jobs.add(task)
    task.add_done_callback(_background_jobs.discard)


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
        "LANGUAGE_UNAVAILABLE": 409,
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

    worker_id = f"http_{uuid.uuid4().hex[:12]}"
    claimed = await asyncio.to_thread(repo.claim_job, body.job_id, worker_id)
    if not claimed:
        current = await asyncio.to_thread(repo.get_job, body.job_id)
        if current and str(current.get("status") or "") in {"completed", "cancelled"}:
            return ProcessJobResponse(
                success=current["status"] == "completed",
                job_id=body.job_id,
                status=str(current["status"]),
                accepted=True,
                paper_id=current.get("generated_paper_id"),
                mock_test_id=current.get("mock_test_id"),
                error_code=current.get("error_code"),
                error_message=current.get("error_message"),
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "JOB_NOT_CLAIMABLE",
                "message": "Generation job is already being processed or is not Python-routed.",
                "retryable": True,
                "stage": "claim",
                "correlation_id": correlation,
            },
        )

    async def _run_claimed() -> None:
        try:
            await process_gov_exam_job(
                claimed,
                settings=settings,
                repo=repo,
                correlation_id=correlation,
            )
        except Exception:  # noqa: BLE001 - engine fail_job already records terminal state
            gov_exam_log(
                "process_job_background_failed",
                operation_id=correlation,
                job_id=body.job_id,
                correlation_id=correlation,
            )

    _spawn_process(_run_claimed())
    return ProcessJobResponse(
        success=True,
        job_id=body.job_id,
        status=str(claimed.get("status") or "leased"),
        accepted=True,
    )


@router.post("/build-paper", response_model=BuildPaperResponse)
async def build_paper(
    body: BuildPaperRequest,
    request: InternalRequest = Depends(require_internal_auth),
) -> BuildPaperResponse:
    """
    Deterministic paper construction entrypoint.

    Product-authoritative path remains process-job + the embedded paper-factory
    worker. This HTTP route is a real claim/process helper for the same durable
    job row — it is not a second paper factory. Edge should prefer
    process-paper-generation-job / PYTHON_FACTORY_OWNED worker polling.
    """
    correlation = body.correlation_id or request.request_id
    settings = get_factory_settings()
    repo = PaperRepository(settings)

    gov_exam_log(
        "build_paper_received",
        operation_id=correlation,
        job_id=body.job_id,
        correlation_id=correlation,
        exam_id=body.exam_id,
        mode=body.mode,
        sources=body.question_sources,
    )

    job = await asyncio.to_thread(repo.get_job, body.job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "JOB_NOT_FOUND",
                "message": "Unknown gov paper generation job.",
                "retryable": False,
                "stage": "build_paper",
                "correlation_id": correlation,
            },
        )

    # The durable job row is authoritative. Claim it before doing any work so
    # concurrent HTTP retries cannot generate/publish the same paper twice.
    worker_id = f"http_{uuid.uuid4().hex[:12]}"
    claimed = await asyncio.to_thread(repo.claim_job, body.job_id, worker_id)
    if not claimed:
        current = await asyncio.to_thread(repo.get_job, body.job_id)
        if current and str(current.get("status") or "") in {"completed", "cancelled"}:
            return BuildPaperResponse(
                success=current["status"] == "completed",
                job_id=body.job_id,
                status=str(current["status"]),
                validation_status="completed" if current["status"] == "completed" else "cancelled",
                missing_slots=0,
                error_code=current.get("error_code"),
                error_message=current.get("error_message"),
                retryable=False,
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "JOB_NOT_CLAIMABLE",
                "message": "Generation job is already being processed or is not Python-routed.",
                "retryable": True,
                "stage": "claim",
                "correlation_id": correlation,
            },
        )

    result = await process_gov_exam_job(
        claimed,
        settings=settings,
        repo=repo,
        correlation_id=correlation,
    )

    mix = {
        k: v
        for k, v in {
            "approved_bank": result.bank_count or 0,
            "ai_generated_practice": result.ai_count or 0,
            "generated_practice": result.deterministic_count or 0,
        }.items()
        if v
    }

    if not result.success:
        return BuildPaperResponse(
            success=False,
            job_id=body.job_id,
            status=result.status,
            source_distribution=mix,
            validation_status="failed",
            missing_slots=0,
            error_code=result.error_code,
            error_message=result.error_message,
            retryable=result.retryable,
        )

    selected: list[str] = []
    generated: list[str] = []
    if result.paper_id:
        try:
            links = await asyncio.to_thread(
                lambda: repo.db.table("gov_generated_paper_questions")
                .select("question_id, source_class, question_source_type")
                .eq("paper_id", result.paper_id)
                .order("sort_order")
                .execute()
            )
            for row in links.data or []:
                qid = str(row.get("question_id") or "")
                if not qid:
                    continue
                st = str(row.get("question_source_type") or row.get("source_class") or "")
                if st in ("generated", "generated_practice", "ai_generated_practice"):
                    generated.append(qid)
                else:
                    selected.append(qid)
        except Exception:  # noqa: BLE001
            pass

    return BuildPaperResponse(
        success=True,
        job_id=body.job_id,
        status=result.status,
        selected_question_ids=selected,
        generated_question_ids=generated,
        source_distribution=mix or (result.source_mix or {}),
        validation_status="passed",
        missing_slots=0,
        paper_id=result.paper_id,
        mock_test_id=result.mock_test_id,
        question_count=result.question_count,
        paper_structure={
            "paper_source": result.paper_source,
            "source_mix": mix,
            "mode": body.mode,
            "language": body.language,
        },
    )
