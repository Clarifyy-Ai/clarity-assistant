from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from uuid import uuid4

from app.document_intelligence.schemas import JobRecord, JobResponse, JobState


class JobRegistry:
    """Bounded in-process registry for admin/ingest jobs only (exam-source, validate-paper).

    Product document user flows use PostgreSQL ``document_processing_jobs`` via
    ``durable_jobs`` — never this registry.
    """

    def __init__(self, max_jobs: int = 2000) -> None:
        self._jobs: dict[str, JobRecord] = {}
        self._request_jobs: dict[str, str] = {}
        self._max_jobs = max_jobs
        self._lock = Lock()

    def create(self, operation: str, correlation_id: str) -> JobResponse:
        now = datetime.now(timezone.utc)
        with self._lock:
            existing_id = self._request_jobs.get(correlation_id)
            if existing_id and existing_id in self._jobs:
                return self._jobs[existing_id]
            if len(self._jobs) >= self._max_jobs:
                oldest_id = min(self._jobs, key=lambda key: self._jobs[key].created_at)
                self._jobs.pop(oldest_id, None)
            job_id = str(uuid4())
            record = JobRecord(
                success=True,
                job_id=job_id,
                state=JobState.QUEUED,
                correlation_id=correlation_id,
                operation=operation,
                created_at=now,
                updated_at=now,
            )
            self._jobs[job_id] = record
            self._request_jobs[correlation_id] = job_id
            return record

    def get(self, job_id: str) -> JobRecord | None:
        with self._lock:
            return self._jobs.get(job_id)

    def update_state(
        self,
        job_id: str,
        state: JobState,
        *,
        result_reference: str | None = None,
        warnings: list[Any] | None = None,
        error: Any | None = None,
    ) -> JobRecord | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            job.state = state
            if result_reference is not None:
                job.result_reference = result_reference
            if warnings is not None:
                job.warnings = warnings
            if error is not None:
                job.error = error
            job.updated_at = datetime.now(timezone.utc)
            return job

    def retry(self, job_id: str) -> JobRecord | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job or job.state != JobState.FAILED_RETRYABLE:
                return None
            job.state = JobState.QUEUED
            job.error = None
            job.updated_at = datetime.now(timezone.utc)
            return job

    def cancel(self, job_id: str) -> JobRecord | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job or job.state in {JobState.COMPLETED, JobState.FAILED_PERMANENT}:
                return None
            job.state = JobState.CANCELLED
            job.updated_at = datetime.now(timezone.utc)
            return job


registry = JobRegistry()
