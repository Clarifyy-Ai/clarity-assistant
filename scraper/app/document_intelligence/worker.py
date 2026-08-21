"""PostgreSQL-backed document job worker primitives and pipeline orchestration.

This module owns leases and processing state only. Credit reservation and
refund/finalization remain Edge Function/PostgreSQL responsibilities.
The Python worker must NOT independently modify credits.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import logging
from typing import Any, Callable

from app.document_intelligence.schemas import JobState
from supabase import Client

logger = logging.getLogger(__name__)


def retry_backoff_seconds(attempt_count: int) -> int:
    """Bounded exponential backoff: 5s, 10s, 20s ... up to one day."""
    attempt = max(1, int(attempt_count))
    return min(86_400, 5 * (2 ** min(attempt - 1, 20)))


@dataclass(frozen=True)
class ClaimedJob:
    job: dict[str, Any]
    worker_id: str


class DocumentJobWorker:
    """PostgreSQL-backed document processing worker with row-level leasing.

    Adheres strictly to the credit boundary: the worker NEVER modifies credits or
    inserts credit transactions directly. It only reports progress and requests
    credit settlement via database RPCs upon successful completion.
    """

    def __init__(self, db: Client, worker_id: str, lease_seconds: int = 180) -> None:
        if len(worker_id.strip()) < 8:
            raise ValueError("worker_id must be at least 8 characters")
        if not 30 <= lease_seconds <= 3600:
            raise ValueError("lease_seconds must be between 30 and 3600")
        self.db = db
        self.worker_id = worker_id
        self.lease_seconds = lease_seconds

    def claim(self) -> ClaimedJob | None:
        """Claim the next available job using PostgreSQL FOR UPDATE SKIP LOCKED leasing."""
        response = self.db.rpc(
            "claim_document_processing_job",
            {"p_worker_id": self.worker_id, "p_lease_seconds": self.lease_seconds},
        ).execute()
        payload = response.data if isinstance(response.data, dict) else {}
        if not payload.get("ok") or not isinstance(payload.get("job"), dict):
            return None
        return ClaimedJob(payload["job"], self.worker_id)

    def heartbeat(self, job_id: str) -> bool:
        """Extend the lease expiration for an active in-flight job."""
        response = self.db.rpc(
            "heartbeat_document_processing_job",
            {
                "p_job_id": job_id,
                "p_worker_id": self.worker_id,
                "p_lease_seconds": self.lease_seconds,
            },
        ).execute()
        return response.data is True

    def transition(
        self,
        job_id: str,
        status: str | JobState,
        *,
        stage: str | None = None,
        result_reference: str | None = None,
        warnings: list[dict[str, Any]] | list[str] | None = None,
        error_code: str | None = None,
        error_message: str | None = None,
        retryable: bool = False,
        attempt_count: int = 1,
    ) -> bool:
        """Transition the job to a new durable state with duplicate-worker protection."""
        status_val = status.value if isinstance(status, JobState) else str(status)
        response = self.db.rpc(
            "transition_document_processing_job",
            {
                "p_job_id": job_id,
                "p_worker_id": self.worker_id,
                "p_status": status_val,
                "p_stage": stage,
                "p_result_reference": result_reference,
                "p_warnings": warnings,
                "p_error_code": error_code,
                "p_error_message": error_message,
                "p_retryable": retryable,
                "p_backoff_seconds": retry_backoff_seconds(attempt_count),
            },
        ).execute()
        payload = response.data if isinstance(response.data, dict) else {}
        return payload.get("ok") is True

    def settle(self, job_id: str) -> bool:
        """Mark reserved credits settled upon job completion; does not mutate balances."""
        response = self.db.rpc(
            "settle_document_processing_job", {"p_job_id": job_id}
        ).execute()
        payload = response.data if isinstance(response.data, dict) else {}
        return payload.get("success") is True

    def execute_pipeline(
        self,
        claimed: ClaimedJob,
        *,
        downloader: Callable[[dict[str, Any]], bytes] | None = None,
        extractor: Callable[[bytes, dict[str, Any]], tuple[Any, Any]] | None = None,
        ocr_processor: Callable[[bytes, dict[str, Any]], Any] | None = None,
        segmenter: Callable[[Any, dict[str, Any]], Any] | None = None,
        validator: Callable[[Any, dict[str, Any]], bool] | None = None,
        needs_review: Callable[[Any, dict[str, Any]], bool] | None = None,
    ) -> bool:
        """Execute the document processing job end-to-end through durable states.

        Stages:
          1. downloading
          2. extracting
          3. OCR
          4. segmenting
          5. validating
          6. awaiting_review or completed

        Handles heartbeats, idempotency, duplicate-worker lease protection,
        cancellation, retryable errors with backoff, and dead-letter promotions.
        """
        job = claimed.job
        job_id = str(job["id"])
        attempt_count = int(job.get("attempt_count") or 1)
        max_attempts = int(job.get("max_attempts") or 3)

        try:
            # Stage 1: downloading
            if not self.transition(job_id, JobState.DOWNLOADING, stage="downloading", attempt_count=attempt_count):
                logger.warning("Failed to transition job %s to downloading (lease lost or cancelled)", job_id)
                return False

            raw_bytes = b""
            if downloader:
                raw_bytes = downloader(job)

            self.heartbeat(job_id)

            # Stage 2: extracting
            if not self.transition(job_id, JobState.EXTRACTING, stage="extracting", attempt_count=attempt_count):
                logger.warning("Failed to transition job %s to extracting (lease lost or cancelled)", job_id)
                return False

            extracted = None
            if extractor:
                extracted = extractor(raw_bytes, job)

            self.heartbeat(job_id)

            # Stage 3: OCR
            if not self.transition(job_id, JobState.OCR, stage="OCR", attempt_count=attempt_count):
                logger.warning("Failed to transition job %s to OCR (lease lost or cancelled)", job_id)
                return False

            ocr_res = None
            if ocr_processor:
                ocr_res = ocr_processor(raw_bytes, job)

            self.heartbeat(job_id)

            # Stage 4: segmenting
            if not self.transition(job_id, JobState.SEGMENTING, stage="segmenting", attempt_count=attempt_count):
                logger.warning("Failed to transition job %s to segmenting (lease lost or cancelled)", job_id)
                return False

            segmented = None
            if segmenter:
                segmented = segmenter(extracted or ocr_res or raw_bytes, job)

            self.heartbeat(job_id)

            # Stage 5: validating
            if not self.transition(job_id, JobState.VALIDATING, stage="validating", attempt_count=attempt_count):
                logger.warning("Failed to transition job %s to validating (lease lost or cancelled)", job_id)
                return False

            if validator:
                is_valid = validator(segmented or extracted or ocr_res, job)
                if not is_valid:
                    raise ValueError("Document validation failed schema checks.")

            self.heartbeat(job_id)

            # Stage 6: awaiting_review or completed
            requires_human_review = False
            if needs_review:
                requires_human_review = bool(needs_review(segmented or extracted, job))

            if requires_human_review:
                ok = self.transition(
                    job_id,
                    JobState.AWAITING_REVIEW,
                    stage="review",
                    result_reference=f"doc-res:{job_id}",
                    attempt_count=attempt_count,
                )
                return ok

            ok = self.transition(
                job_id,
                JobState.COMPLETED,
                stage="completed",
                result_reference=f"doc-res:{job_id}",
                attempt_count=attempt_count,
            )
            if ok:
                # Settle reserved credits upon completion
                self.settle(job_id)
            return ok

        except Exception as exc:
            logger.exception("Error processing document job %s: %s", job_id, exc)
            is_retryable = not isinstance(exc, (ValueError, TypeError))
            error_code = "PROCESSING_ERROR" if is_retryable else "FATAL_PARSER_ERROR"
            error_message = str(exc)

            if is_retryable and attempt_count < max_attempts:
                self.transition(
                    job_id,
                    JobState.FAILED_RETRYABLE,
                    stage="error",
                    error_code=error_code,
                    error_message=error_message,
                    retryable=True,
                    attempt_count=attempt_count,
                )
            else:
                self.transition(
                    job_id,
                    JobState.FAILED_PERMANENT,
                    stage="error",
                    error_code=error_code,
                    error_message=error_message,
                    retryable=False,
                    attempt_count=attempt_count,
                )
            return False
