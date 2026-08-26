"""PostgreSQL-backed document job worker primitives and pipeline orchestration.

This module owns leases and processing state only. Credit reservation and
refund/finalization remain Edge Function/PostgreSQL responsibilities.
The Python worker must NOT independently modify credits.
"""
from __future__ import annotations

import asyncio
import logging
import os
import socket
import uuid
from dataclasses import dataclass
from typing import Any, Callable

from supabase import Client, create_client

from app.document_intelligence.parsers.errors import ParseError
from app.document_intelligence.schemas import JobState

logger = logging.getLogger(__name__)

# Aligned with Edge DOCUMENT_MAX_BYTES / client DOCUMENT_MAX_BYTES (fail-closed).
DOCUMENT_MAX_BYTES = 20 * 1024 * 1024


def document_worker_id() -> str:
    return f"py-doc-{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:6]}"


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

    def project_document(
        self,
        job: dict[str, Any],
        *,
        status: str,
        parsed: Any = None,
        error_code: str | None = None,
        error_message: str | None = None,
    ) -> None:
        """Persist the job's user-visible state on the library document.

        Durable jobs and library rows are separate records.  Keeping this
        projection in the worker makes refreshes truthful even when the Edge
        request that created the job has already ended.
        """
        document_id = job.get("document_id")
        if not document_id or not hasattr(self.db, "from_"):
            return

        payload: dict[str, Any] = {
            "processing_status": status,
            "processing_error": error_message,
        }
        if parsed is not None:
            doc = parsed[0] if isinstance(parsed, tuple) and parsed else parsed
            if hasattr(doc, "model_dump"):
                value = doc.model_dump(mode="json")
                payload["parsed_content"] = value.get("text", "")
                payload["parsed_metadata"] = {
                    key: value[key]
                    for key in ("filename", "media_type", "pages", "warnings", "confidence", "review_required")
                    if key in value
                }
                payload["parser_version"] = value.get("parser_version")
            elif isinstance(doc, dict):
                payload["parsed_content"] = str(doc.get("text") or "")
                payload["parsed_metadata"] = doc

        response = (
            self.db.from_("personal_library_documents")
            .update(payload)
            .eq("id", str(document_id))
            .execute()
        )
        if getattr(response, "error", None):
            raise RuntimeError(f"Could not persist document state: {response.error}")

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
            self.project_document(job, status="processing")
            # Stage 1: downloading
            if not self.transition(job_id, JobState.DOWNLOADING, stage="downloading", attempt_count=attempt_count):
                logger.warning("Failed to transition job %s to downloading (lease lost or cancelled)", job_id)
                return False

            raw_bytes = b""
            if downloader:
                raw_bytes = downloader(job)

            if len(raw_bytes) > DOCUMENT_MAX_BYTES:
                max_mb = DOCUMENT_MAX_BYTES // (1024 * 1024)
                raise ParseError(
                    "DOCUMENT_SIZE_INVALID",
                    f"File is too large. Maximum size is {max_mb} MB.",
                    retryable=False,
                    stage="downloading",
                )

            self.heartbeat(job_id)

            # Stage 2: extracting
            if not self.transition(job_id, JobState.EXTRACTING, stage="extracting", attempt_count=attempt_count):
                logger.warning("Failed to transition job %s to extracting (lease lost or cancelled)", job_id)
                return False

            extracted = None
            if extractor:
                extracted = extractor(raw_bytes, job)

            self.heartbeat(job_id)

            ocr_res = None
            should_ocr = _needs_ocr(extracted)
            if should_ocr:
                self.project_document(job, status="ocr_required", parsed=extracted)
                if not self.transition(job_id, JobState.OCR, stage="OCR", attempt_count=attempt_count):
                    logger.warning("Failed to transition job %s to OCR (lease lost or cancelled)", job_id)
                    return False
                self.project_document(job, status="ocr_processing", parsed=extracted)
            if should_ocr and ocr_processor:
                try:
                    ocr_res = ocr_processor(raw_bytes, job, extracted)
                except TypeError:
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
            # Segmentation is derived structure; persist the parser result as
            # the document's canonical readable content.
            final_document = ocr_res or extracted

            # Stage 6: awaiting_review or completed
            requires_human_review = False
            if needs_review:
                requires_human_review = bool(needs_review(segmented or extracted, job))

            if requires_human_review:
                self.project_document(job, status="processing", parsed=final_document)
                ok = self.transition(
                    job_id,
                    JobState.AWAITING_REVIEW,
                    stage="review",
                    result_reference=f"doc-res:{job_id}",
                    attempt_count=attempt_count,
                )
                return ok

            self.project_document(job, status="completed", parsed=final_document)
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
            is_retryable = getattr(exc, "retryable", None)
            if is_retryable is None:
                is_retryable = not isinstance(exc, (ValueError, TypeError))
            error_code = getattr(exc, "code", None) or (
                "PARSER_FAILED" if isinstance(exc, (ValueError, TypeError)) else "PARSER_UNAVAILABLE"
            )
            error_code = {
                "UNSUPPORTED_FORMAT": "UNSUPPORTED_FILE_TYPE",
                "OCR_UNAVAILABLE": "PARSER_UNAVAILABLE",
                "OCR_EMPTY": "PARSER_FAILED",
            }.get(error_code, error_code)
            error_message = str(exc)

            if is_retryable and attempt_count < max_attempts:
                self.project_document(
                    job,
                    status="failed_retryable",
                    error_code=error_code,
                    error_message=error_message,
                )
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
                self.project_document(
                    job,
                    status="failed_permanent",
                    error_code=error_code,
                    error_message=error_message,
                )
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


def _download_document(db: Client, job: dict[str, Any]) -> bytes:
    storage_ref = job.get("storage_reference") or {}
    bucket = storage_ref.get("bucket") or "documents"
    path = storage_ref.get("path")
    if not path:
        raise ValueError("Job storage_reference.path is missing")
    response = db.storage.from_(bucket).download(path)
    if isinstance(response, bytes):
        raw = response
    elif hasattr(response, "read"):
        raw = response.read()
    else:
        raise ValueError("Storage download returned unexpected payload")
    if len(raw) > DOCUMENT_MAX_BYTES:
        max_mb = DOCUMENT_MAX_BYTES // (1024 * 1024)
        raise ParseError(
            "DOCUMENT_SIZE_INVALID",
            f"File is too large. Maximum size is {max_mb} MB.",
            retryable=False,
            stage="downloading",
        )
    return raw


def _needs_ocr(extracted: Any) -> bool:
    doc = extracted[0] if isinstance(extracted, tuple) and extracted else extracted
    if isinstance(doc, dict):
        text = str(doc.get("text") or "").strip()
        confidence = doc.get("confidence")
    else:
        text = str(getattr(doc, "text", "") or "").strip()
        confidence = getattr(doc, "confidence", None)
    if not text:
        return True
    if confidence is not None and float(confidence) < 0.6:
        return True
    return False


def _ocr_document(raw_bytes: bytes, job: dict[str, Any], extracted: Any = None) -> Any:
    """Run OCR only when extraction is empty or low-confidence.

    parse_pdf / parse_image already OCR scanned pages. This stage re-runs that
    path when the extract result is unusable, and fails retryably if OCR deps
    are missing instead of completing with empty text.
    """
    if extracted is not None and not _needs_ocr(extracted):
        return extracted
    from app.document_intelligence.parsers.errors import ParseError
    from app.document_intelligence.parsers.document import parse_bytes

    storage_ref = job.get("storage_reference") or {}
    filename = "document.pdf"
    if isinstance(storage_ref, dict):
        path = str(storage_ref.get("path") or "")
        if path:
            filename = path.rsplit("/", 1)[-1] or filename
    try:
        parsed = parse_bytes(raw_bytes, filename)
    except ParseError as exc:
        if getattr(exc, "code", "") == "OCR_UNAVAILABLE":
            raise
        raise
    if not str(getattr(parsed, "text", "") or "").strip():
        raise ParseError(
            "OCR_EMPTY",
            "OCR produced no text; document cannot be marked complete.",
            retryable=True,
            stage="ocr",
        )
    return parsed


def _extract_document(raw_bytes: bytes, job: dict[str, Any]) -> tuple[Any, Any]:
    """Extract and classify via the hybrid ``document_extract`` engine (python → ai at Edge)."""
    import base64

    from app.document_intelligence.parsers.models import PageResult, ParseWarning, ParsedDocument
    from app.engines.document_extract import run_document_extract

    storage_ref = job.get("storage_reference") or {}
    filename = "document.pdf"
    if isinstance(storage_ref, dict):
        path = str(storage_ref.get("path") or "")
        if path:
            filename = path.rsplit("/", 1)[-1] or filename

    category = str(
        job.get("category")
        or job.get("file_category")
        or (storage_ref.get("file_category") if isinstance(storage_ref, dict) else "")
        or ""
    ).lower()
    mime = str(storage_ref.get("mime_type") if isinstance(storage_ref, dict) else "") or "application/octet-stream"
    operation_id = str(job.get("id") or "document-extract")
    correlation_id = str(job.get("correlation_id") or operation_id)

    result = run_document_extract(
        {
            "content_base64": base64.b64encode(raw_bytes).decode("ascii"),
            "filename": filename,
            "mime": mime,
            "mime_type": mime,
            "document_kind": category or None,
            "category_hint": category or None,
        },
        operation_id=operation_id,
        correlation_id=correlation_id,
    )

    warnings = [
        ParseWarning(code=str(code), message=str(code))
        if isinstance(code, str)
        else ParseWarning(code="warning", message=str(code))
        for code in result.get("warnings") or []
    ]
    review_required = (
        result.get("detected_document_type") == "UNKNOWN_REVIEW"
        or "review_required" in (result.get("warnings") or [])
    )
    parsed = ParsedDocument(
        parser_version="document_extract",
        filename=filename,
        media_type=mime,
        pages=[
            PageResult(
                page_number=max(1, int(result.get("page_count") or 1)),
                text=str(result.get("extracted_text") or ""),
                extraction_method="text",
            )
        ],
        text=str(result.get("extracted_text") or ""),
        warnings=warnings,
        confidence=float(result.get("confidence") or 0.0),
        review_required=review_required,
    )
    return parsed, result.get("structured")


def _validate_extraction(extracted: Any, _job: dict[str, Any]) -> bool:
    if isinstance(extracted, tuple) and extracted:
        doc = extracted[0]
        return bool(getattr(doc, "text", "").strip())
    if hasattr(extracted, "text"):
        return bool(getattr(extracted, "text", "").strip())
    return extracted is not None


def _needs_review(extracted: Any, _job: dict[str, Any]) -> bool:
    if isinstance(extracted, tuple) and extracted:
        doc = extracted[0]
        return bool(getattr(doc, "review_required", False))
    return bool(getattr(extracted, "review_required", False))


async def worker_loop(
    *,
    supabase_url: str,
    supabase_service_role_key: str,
    stop: asyncio.Event | None = None,
    once: bool = False,
    poll_seconds: float = 5.0,
    lease_seconds: int = 180,
) -> int:
    """Poll for claimable document jobs until stopped.

    Runs the durable state machine via ``DocumentJobWorker.execute_pipeline``.
    Stage callbacks (download/extract/OCR) are optional; when absent the worker
    still advances leases so Edge-enqueued jobs are claimed. Returns jobs claimed.
    """
    stop_event = stop or asyncio.Event()
    identity = document_worker_id()
    db = create_client(supabase_url, supabase_service_role_key)
    worker = DocumentJobWorker(db, identity, lease_seconds=lease_seconds)
    processed = 0

    logger.info("document_worker_started worker_id=%s once=%s", identity, once)
    while not stop_event.is_set():
        claimed: ClaimedJob | None = None
        try:
            claimed = await asyncio.to_thread(worker.claim)
        except Exception as exc:  # noqa: BLE001 — transient DB/network
            logger.error("document_worker_claim_failed: %s", exc)
            claimed = None

        if claimed is None:
            if once:
                break
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=max(1.0, poll_seconds))
            except asyncio.TimeoutError:
                pass
            continue

        job_id = str(claimed.job.get("id"))
        logger.info("document_worker_job_claimed job_id=%s worker_id=%s", job_id, identity)

        def downloader(job: dict[str, Any]) -> bytes:
            return _download_document(db, job)

        def extractor(raw: bytes, job: dict[str, Any]) -> tuple[Any, Any]:
            return _extract_document(raw, job)

        def ocr_processor(raw: bytes, job: dict[str, Any], extracted: Any = None) -> Any:
            return _ocr_document(raw, job, extracted)

        try:
            await asyncio.to_thread(
                worker.execute_pipeline,
                claimed,
                downloader=downloader,
                extractor=extractor,
                ocr_processor=ocr_processor,
                validator=_validate_extraction,
                needs_review=_needs_review,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("document_worker_pipeline_error job_id=%s: %s", job_id, exc)
        processed += 1
        if once:
            break

    logger.info(
        "document_worker_stopped worker_id=%s processed=%s", identity, processed
    )
    return processed
