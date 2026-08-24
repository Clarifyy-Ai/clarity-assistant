"""Job worker: drains `gov_paper_generation_jobs` rows routed to the Python factory."""
from __future__ import annotations

import asyncio
import os
import socket
import uuid
from typing import Any

from app.core.logger import get_logger
from app.gov_exams.observability import gov_exam_log
from app.paper_factory.config import FactorySettings, get_factory_settings
from app.paper_factory.factory import GenerationRequest, PaperFactory
from app.paper_factory.models import PaperFactoryError, PaperResult
from app.paper_factory.repository import PaperRepository

log = get_logger("paper_factory.worker")


def worker_id() -> str:
    return f"py-factory-{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:6]}"


def request_from_job(job: dict[str, Any]) -> GenerationRequest:
    """Translate a job row into a generation request."""
    payload = job.get("request_json") or {}

    def optional_int(key: str) -> int | None:
        value = payload.get(key)
        try:
            number = int(value)
        except (TypeError, ValueError):
            return None
        return number if number > 0 else None

    return GenerationRequest(
        exam_query=str(job.get("exam_id")),
        stage=str(job["stage_id"]) if job.get("stage_id") else None,
        mode=str(job.get("mode") or "generated_mock"),
        language=str(job.get("language") or payload.get("language") or "en"),
        question_count=optional_int("questionCount"),
        duration_minutes=optional_int("durationMinutes"),
        random_seed=str(job.get("random_seed") or job.get("id")),
        user_id=str(job.get("user_id")),
        job_id=str(job.get("id")),
        use_bank=payload.get("useBank") is not False,
        publish=True,
        make_questions_public=False,
    )


async def process_job(
    job: dict[str, Any],
    *,
    settings: FactorySettings,
    repo: PaperRepository,
) -> PaperResult | None:
    """Generate and publish one job, updating its state machine throughout."""
    job_id = str(job["id"])
    correlation_id = str(
        ((job.get("request_json") or {}) or {}).get("correlationId") or job_id
    )
    operation_id = f"gov-exam-worker-{job_id}"

    gov_exam_log(
        "job_received",
        operation_id=operation_id,
        job_id=job_id,
        correlation_id=correlation_id,
        worker="paper_factory",
        mode=job.get("mode"),
    )

    factory = PaperFactory(settings, repo)
    request = request_from_job(job)

    async def on_stage(stage: str) -> None:
        await asyncio.to_thread(repo.set_stage, job_id, stage)
        event_map = {
            "selecting_questions": "selection_started",
            "validating_questions": "validation_started",
            "generating_questions": "ai_generation_started",
            "generating_missing_slots": "ai_generation_started",
            "assembling": "assembly_started",
        }
        event = event_map.get(stage)
        if event:
            gov_exam_log(
                event,
                operation_id=operation_id,
                job_id=job_id,
                correlation_id=correlation_id,
                stage=stage,
            )

    async def on_progress(_completed: int, _total: int) -> None:
        # Long provider calls can outlive the lease; stage writes renew it.
        await asyncio.to_thread(repo.set_stage, job_id, "generating_missing_slots")

    try:
        result = await factory.generate(
            request,
            on_stage=on_stage,
            on_progress=on_progress,
        )
    except PaperFactoryError as exc:
        if exc.code in {"AI_PROVIDER_UNCONFIGURED", "GENERATION_INCOMPLETE", "CONTENT_INSUFFICIENT"}:
            gov_exam_log(
                "ai_generation_failed",
                operation_id=operation_id,
                job_id=job_id,
                correlation_id=correlation_id,
                error_code=exc.code,
                error=exc.message[:300],
            )
            gov_exam_log(
                "python_fallback_started",
                operation_id=operation_id,
                job_id=job_id,
                correlation_id=correlation_id,
                reason=exc.code,
            )
        log.error(
            "paper_factory_job_failed",
            job_id=job_id,
            code=exc.code,
            retryable=exc.retryable,
            error=exc.message,
        )
        await asyncio.to_thread(
            repo.fail_job,
            job_id,
            code=exc.code,
            message=exc.message,
            retryable=exc.retryable,
        )
        await _compensate(job, repo)
        gov_exam_log(
            "completed",
            operation_id=operation_id,
            job_id=job_id,
            correlation_id=correlation_id,
            success=False,
            error_code=exc.code,
        )
        return None
    except Exception as exc:  # noqa: BLE001 - never leave a job stuck in-flight
        log.exception("paper_factory_job_crashed", job_id=job_id)
        await asyncio.to_thread(
            repo.fail_job,
            job_id,
            code="PAPER_GENERATION_FAILED",
            message=str(exc),
            retryable=True,
        )
        await _compensate(job, repo)
        gov_exam_log(
            "completed",
            operation_id=operation_id,
            job_id=job_id,
            correlation_id=correlation_id,
            success=False,
            error_code="PAPER_GENERATION_FAILED",
        )
        return None

    await asyncio.to_thread(
        repo.complete_job,
        job_id,
        paper_id=str(result.paper_id),
        mock_test_id=str(result.mock_test_id),
    )
    gov_exam_log(
        "completed",
        operation_id=operation_id,
        job_id=job_id,
        correlation_id=correlation_id,
        success=True,
        paper_id=result.paper_id,
        mock_test_id=result.mock_test_id,
        bank_count=result.bank_count,
        generated_count=result.generated_count,
    )
    return result


async def _compensate(job: dict[str, Any], repo: PaperRepository) -> None:
    """Refund credits that were charged for a generation that never delivered."""
    charged = int(job.get("credits_charged") or 0)
    user_id = job.get("user_id")
    if charged <= 0 or not user_id:
        return
    await asyncio.to_thread(
        repo.refund_credits,
        str(user_id),
        charged,
        f"refund_paper_factory_job_{job.get('id')}",
    )


async def worker_loop(
    *,
    settings: FactorySettings | None = None,
    stop: asyncio.Event | None = None,
    once: bool = False,
) -> int:
    """Poll for claimable jobs until stopped. Returns the number processed."""
    active_settings = settings or get_factory_settings()
    repo = PaperRepository(active_settings)
    identity = worker_id()
    stop_event = stop or asyncio.Event()
    processed = 0

    log.info(
        "paper_factory_worker_started",
        worker_id=identity,
        once=once,
        has_ai_provider=active_settings.has_ai_provider,
    )
    while not stop_event.is_set():
        try:
            job = await asyncio.to_thread(repo.claim_next_job, identity)
        except Exception as exc:  # noqa: BLE001 - transient DB/network issues
            log.error("paper_factory_claim_failed", error=str(exc))
            job = None

        if job is None:
            if once:
                break
            try:
                await asyncio.wait_for(
                    stop_event.wait(), timeout=active_settings.poll_interval_seconds
                )
            except asyncio.TimeoutError:
                pass
            continue

        log.info("paper_factory_job_claimed", job_id=job["id"], worker_id=identity)
        await process_job(job, settings=active_settings, repo=repo)
        processed += 1
        if once:
            break

    log.info("paper_factory_worker_stopped", worker_id=identity, processed=processed)
    return processed
