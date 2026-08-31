"""AI paper generation endpoints (admin only)."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.security import get_admin_user
from app.paper_factory.blueprint import blueprint_summary
from app.paper_factory.config import FactorySettings, get_factory_settings
from app.paper_factory.export import to_dict
from app.paper_factory.factory import GenerationRequest, PaperFactory
from app.paper_factory.models import PaperFactoryError
from app.paper_factory.repository import PaperRepository
from app.paper_factory.worker import process_job

router = APIRouter(prefix="/paper-factory", tags=["paper-factory"])

MODES = ("official_previous", "generated_mock", "custom_mock", "adaptive")


class PlanRequest(BaseModel):
    exam: str = Field(..., min_length=1, max_length=200)
    stage: str | None = Field(default=None, max_length=120)
    language: str = Field(default="en", max_length=8)
    mode: str = Field(default="generated_mock")
    question_count: int | None = Field(default=None, ge=5, le=300)
    duration_minutes: int | None = Field(default=None, ge=5, le=600)
    seed: str | None = Field(default=None, max_length=80)


class GenerateRequest(PlanRequest):
    user_id: str | None = Field(default=None, description="Owner; required to publish")
    publish: bool = True
    use_bank: bool = True
    include_questions: bool = False
    title: str | None = Field(default=None, max_length=200)


def _settings() -> FactorySettings:
    return get_factory_settings()


def _to_request(body: PlanRequest, **extra) -> GenerationRequest:
    if body.mode not in MODES:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "INVALID_MODE",
                "message": f"mode must be one of {', '.join(MODES)}",
                "retryable": False,
            },
        )
    return GenerationRequest(
        exam_query=body.exam,
        stage=body.stage,
        mode=body.mode,
        language=body.language,
        question_count=body.question_count,
        duration_minutes=body.duration_minutes,
        random_seed=body.seed,
        **extra,
    )


def _http_error(exc: PaperFactoryError) -> HTTPException:
    status_map = {
        "EXAM_NOT_FOUND": 404,
        "STAGE_NOT_FOUND": 404,
        "PATTERN_NOT_FOUND": 409,
        "PATTERN_INVALID": 409,
        "EXAM_NOT_APPROVED": 403,
        "INVALID_MODE": 422,
        "USER_REQUIRED": 422,
        "AI_PROVIDER_UNCONFIGURED": 503,
        "PROVIDER_UNAVAILABLE": 503,
        "GENERATION_INCOMPLETE": 502,
    }
    return HTTPException(
        status_code=status_map.get(exc.code, 500),
        detail={
            "code": exc.code,
            "message": exc.message,
            "retryable": exc.retryable,
            "stage": "paper_generation",
        },
    )


@router.get("/exams")
async def exams(_admin: dict = Depends(get_admin_user)) -> dict[str, object]:
    repo = PaperRepository(_settings())
    rows = await asyncio.to_thread(repo.list_exams)
    return {"success": True, "count": len(rows), "exams": rows}


@router.post("/plan")
async def plan(
    body: PlanRequest, _admin: dict = Depends(get_admin_user)
) -> dict[str, object]:
    """Return the generation blueprint without spending any AI budget."""
    factory = PaperFactory(_settings())
    try:
        blueprint = await factory.plan(_to_request(body))
    except PaperFactoryError as exc:
        raise _http_error(exc) from exc
    return {"success": True, "plan": blueprint_summary(blueprint)}


def _require_non_production_lab() -> None:
    """User-facing generation must go through Edge create-exam-paper."""
    if get_settings().app_env.lower() == "production":
        raise HTTPException(
            status_code=410,
            detail={
                "code": "USE_EDGE_CREATE_EXAM_PAPER",
                "message": "Direct paper generation is disabled. Create a durable job via Edge create-exam-paper.",
                "retryable": False,
                "stage": "paper_generation",
            },
        )


@router.post("/generate")
async def generate(
    body: GenerateRequest, admin: dict = Depends(get_admin_user)
) -> dict[str, object]:
    """Lab-only generate. Production requires Edge create-exam-paper."""
    _require_non_production_lab()
    settings = _settings()
    owner = body.user_id or admin.get("id")
    request = _to_request(
        body,
        user_id=owner,
        publish=body.publish,
        use_bank=body.use_bank,
        title=body.title,
    )

    try:
        result = await PaperFactory(settings).generate(request)
    except PaperFactoryError as exc:
        raise _http_error(exc) from exc

    payload: dict[str, object] = {
        "success": True,
        "exam": result.blueprint.exam.prompt_label,
        "question_count": len(result.questions),
        "planned_count": result.blueprint.total_questions,
        "complete": result.is_complete,
        "bank_questions": result.bank_count,
        "ai_questions": result.generated_count,
        "ai_calls": result.ai_calls,
        "rejected_candidates": result.rejected_count,
        "quality_score": result.quality_score,
        "paper_id": result.paper_id,
        "mock_test_id": result.mock_test_id,
        "disclaimer": result.blueprint.label,
    }
    if body.include_questions:
        payload["paper"] = to_dict(result)
    return payload


@router.post("/jobs/{job_id}/process")
async def process_queued_job(
    job_id: str, _admin: dict = Depends(get_admin_user)
) -> dict[str, object]:
    """Run one queued job. Production browsers must use Edge process-paper-generation-job."""
    if get_settings().app_env.lower() == "production":
        raise HTTPException(
            status_code=410,
            detail={
                "code": "USE_EDGE_PROCESS_PAPER_JOB",
                "message": "Direct job processing is disabled. Use Edge process-paper-generation-job.",
                "retryable": False,
                "stage": "paper_generation",
            },
        )
    settings = _settings()
    repo = PaperRepository(settings)

    job = await asyncio.to_thread(repo.get_job, job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail={"code": "JOB_NOT_FOUND", "message": "Unknown job", "retryable": False},
        )
    if job.get("status") == "completed":
        return {
            "success": True,
            "already_completed": True,
            "paper_id": job.get("generated_paper_id"),
            "mock_test_id": job.get("mock_test_id"),
        }

    result = await process_job(job, settings=settings, repo=repo)
    if result is None:
        refreshed = await asyncio.to_thread(repo.get_job, job_id) or {}
        raise HTTPException(
            status_code=502,
            detail={
                "code": refreshed.get("error_code") or "PAPER_GENERATION_FAILED",
                "message": refreshed.get("error_message") or "Generation failed.",
                "retryable": bool(refreshed.get("retryable")),
                "stage": "paper_generation",
            },
        )

    return {
        "success": True,
        "job_id": job_id,
        "paper_id": result.paper_id,
        "mock_test_id": result.mock_test_id,
        "question_count": len(result.questions),
        "quality_score": result.quality_score,
    }
