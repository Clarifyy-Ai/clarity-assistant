"""Job worker: drains `gov_paper_generation_jobs` rows routed to the Python factory.

Uses the same hybrid pipeline as HTTP `/internal/gov-exams/process-job`
(`process_gov_exam_job`). Does not mutate user credit balances — Edge/DB
owns reserve / finalize / release.
"""
from __future__ import annotations

import asyncio
import os
import socket
import uuid
from typing import Any

from app.core.logger import get_logger
from app.gov_exams.engine import process_gov_exam_job
from app.gov_exams.observability import gov_exam_log
from app.paper_factory.config import FactorySettings, get_factory_settings
from app.paper_factory.factory import GenerationRequest
from app.paper_factory.models import PaperFactoryError
from app.paper_factory.repository import PaperRepository

log = get_logger("paper_factory.worker")


def worker_id() -> str:
    return f"py-factory-{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:6]}"


def request_from_job(job: dict[str, Any]) -> GenerationRequest:
    """Translate a job row into a generation request (tests + diagnostics)."""
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
        allow_deterministic_fill=payload.get("allowDeterministicFill") is True,
    )


async def process_job(
    job: dict[str, Any],
    *,
    settings: FactorySettings,
    repo: PaperRepository,
) -> Any:
    """Run the hybrid engine for one already-claimed job row."""
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

    try:
        result = await process_gov_exam_job(
            job,
            settings=settings,
            repo=repo,
            correlation_id=correlation_id,
        )
    except PaperFactoryError as exc:
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
        gov_exam_log(
            "completed",
            operation_id=operation_id,
            job_id=job_id,
            correlation_id=correlation_id,
            success=False,
            error_code="PAPER_GENERATION_FAILED",
        )
        return None

    gov_exam_log(
        "completed",
        operation_id=operation_id,
        job_id=job_id,
        correlation_id=correlation_id,
        success=bool(result.success),
        paper_id=result.paper_id,
        mock_test_id=result.mock_test_id,
        bank_count=result.bank_count,
        generated_count=(result.ai_count or 0) + (result.deterministic_count or 0),
        error_code=result.error_code,
    )
    return result


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
