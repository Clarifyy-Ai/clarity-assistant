"""In-memory job registry + async worker that runs the scrape pipeline."""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

from supabase import Client

from app.core.config import Settings
from app.core.logger import get_logger
from app.models.schemas import JobProgress, JobState, JobStatus
from app.scraper.pipeline import ScrapePipeline

log = get_logger(__name__)


class JobHandle:
    __slots__ = (
        "state",
        "task",
        "pause_event",
        "cancel_event",
        "log_buffer",
    )

    def __init__(self, state: JobState) -> None:
        self.state = state
        self.task: asyncio.Task[Any] | None = None
        self.pause_event = asyncio.Event()
        self.cancel_event = asyncio.Event()
        self.log_buffer: list[str] = []


class JobRegistry:
    """Process-local job registry. For multi-replica deploys, swap for Redis."""

    def __init__(self) -> None:
        self._jobs: dict[str, JobHandle] = {}
        self._lock = asyncio.Lock()

    async def create(
        self,
        exam_type: str,
        year_from: int | None,
        year_to: int | None,
        settings: Settings,
        supabase: Client,
    ) -> JobState:
        async with self._lock:
            job_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc)
            state = JobState(
                job_id=job_id,
                exam_type=exam_type,
                status=JobStatus.QUEUED,
                progress=JobProgress(),
                logs=[],
                created_at=now,
                updated_at=now,
            )
            handle = JobHandle(state)

            def on_progress(p: JobProgress) -> None:
                state.progress = p
                state.updated_at = datetime.now(timezone.utc)

            pipeline = ScrapePipeline(
                settings=settings,
                supabase=supabase,
                exam_type=exam_type,
                year_from=year_from,
                year_to=year_to,
                job_id=job_id,
                progress_cb=on_progress,
                pause_event=handle.pause_event,
                cancel_event=handle.cancel_event,
            )

            async def _runner() -> None:
                state.status = JobStatus.RUNNING
                try:
                    await pipeline.run()
                    if handle.cancel_event.is_set():
                        state.status = JobStatus.CANCELLED
                    else:
                        state.status = JobStatus.COMPLETED
                except Exception as exc:
                    log.error("job_failed", job_id=job_id, error=str(exc))
                    handle.log_buffer.append(f"failed: {exc}")
                    state.status = JobStatus.FAILED
                finally:
                    state.updated_at = datetime.now(timezone.utc)
                    state.logs = handle.log_buffer[-50:]

            handle.task = asyncio.create_task(_runner(), name=f"scrape-{job_id}")
            self._jobs[job_id] = handle
            return state

    def get(self, job_id: str) -> JobHandle | None:
        return self._jobs.get(job_id)

    def snapshot(self, job_id: str) -> JobState | None:
        handle = self._jobs.get(job_id)
        if not handle:
            return None
        handle.state.logs = handle.log_buffer[-50:]
        return handle.state

    def pause(self, job_id: str) -> bool:
        h = self._jobs.get(job_id)
        if not h or h.state.status != JobStatus.RUNNING:
            return False
        h.pause_event.set()
        h.state.status = JobStatus.PAUSED
        return True

    def resume(self, job_id: str) -> bool:
        h = self._jobs.get(job_id)
        if not h or h.state.status != JobStatus.PAUSED:
            return False
        h.pause_event.clear()
        h.state.status = JobStatus.RUNNING
        return True

    def cancel(self, job_id: str) -> bool:
        h = self._jobs.get(job_id)
        if not h:
            return False
        h.cancel_event.set()
        h.pause_event.clear()
        return True


registry = JobRegistry()
