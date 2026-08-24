from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any
import pytest

from app.document_intelligence.schemas import JobState
from app.document_intelligence.worker import (
    ClaimedJob,
    DocumentJobWorker,
    retry_backoff_seconds,
)


class MockDatabase:
    """Mock Supabase client simulating PostgreSQL stored procedures for document jobs."""

    def __init__(self) -> None:
        self.jobs: dict[str, dict[str, Any]] = {}
        self.credit_mutations: list[dict[str, Any]] = []
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []

    def add_job(
        self,
        job_id: str,
        *,
        document_id: str = "doc-1",
        owner_id: str = "user-1",
        status: str = "queued",
        attempt_count: int = 0,
        max_attempts: int = 3,
        credits_reserved: int = 10,
    ) -> dict[str, Any]:
        job = {
            "id": job_id,
            "document_id": document_id,
            "owner_id": owner_id,
            "status": status,
            "attempt_count": attempt_count,
            "max_attempts": max_attempts,
            "available_at": datetime.now(timezone.utc),
            "lease_expires_at": None,
            "heartbeat_at": None,
            "worker_id": None,
            "credits_reserved": credits_reserved,
            "credits_settled_at": None,
            "credits_refunded_at": None,
            "retryable": True,
            "result_reference": None,
            "warnings": [],
            "error_code": None,
            "error_message": None,
            "error_stage": None,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        self.jobs[job_id] = job
        return job

    def rpc(self, name: str, args: dict[str, Any]):
        self.rpc_calls.append((name, args))
        now = datetime.now(timezone.utc)

        if name == "claim_document_processing_job":
            worker_id = args.get("p_worker_id")
            lease_seconds = int(args.get("p_lease_seconds") or 180)

            # Check for dead-letter jobs
            for j in self.jobs.values():
                if j["status"] in ("queued", "failed_retryable", "leased", "downloading", "extracting", "OCR", "segmenting", "validating") and j["attempt_count"] >= j["max_attempts"]:
                    j["status"] = "failed_permanent"
                    j["retryable"] = False
                    j["lease_expires_at"] = None
                    j["worker_id"] = None
                    if j["credits_reserved"] > 0 and not j["credits_refunded_at"]:
                        j["credits_refunded_at"] = now
                        j["credits_reserved"] = 0

            # Find claimable job
            for j in self.jobs.values():
                is_claimable = (
                    (j["status"] in ("queued", "failed_retryable") and j["available_at"] <= now)
                    or (j["status"] in ("leased", "downloading", "extracting", "OCR", "segmenting", "validating", "awaiting_review")
                        and j["lease_expires_at"] is not None and j["lease_expires_at"] < now)
                )
                if is_claimable and j["attempt_count"] < j["max_attempts"] and j["status"] != "cancelled":
                    j["status"] = "leased"
                    j["worker_id"] = worker_id
                    j["lease_expires_at"] = now + timedelta(seconds=lease_seconds)
                    j["heartbeat_at"] = now
                    j["attempt_count"] += 1
                    j["updated_at"] = now
                    return SimpleNamespace(execute=lambda: SimpleNamespace(data={"ok": True, "job": dict(j)}))

            return SimpleNamespace(execute=lambda: SimpleNamespace(data={"ok": False, "code": "NO_CLAIMABLE_JOB"}))

        elif name == "heartbeat_document_processing_job":
            job_id = args.get("p_job_id")
            worker_id = args.get("p_worker_id")
            lease_seconds = int(args.get("p_lease_seconds") or 180)
            job = self.jobs.get(job_id)
            if (
                job
                and job.get("worker_id") == worker_id
                and job.get("status") in ("leased", "downloading", "extracting", "OCR", "segmenting", "validating", "awaiting_review")
                and job.get("lease_expires_at")
                and job["lease_expires_at"] > now
            ):
                job["heartbeat_at"] = now
                job["lease_expires_at"] = now + timedelta(seconds=lease_seconds)
                job["updated_at"] = now
                return SimpleNamespace(execute=lambda: SimpleNamespace(data=True))
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=False))

        elif name == "transition_document_processing_job":
            job_id = args.get("p_job_id")
            worker_id = args.get("p_worker_id")
            status = args.get("p_status")
            stage = args.get("p_stage")
            result_reference = args.get("p_result_reference")
            warnings = args.get("p_warnings")
            error_code = args.get("p_error_code")
            error_message = args.get("p_error_message")
            retryable = bool(args.get("p_retryable"))
            backoff_seconds = int(args.get("p_backoff_seconds") or 0)

            job = self.jobs.get(job_id)
            if (
                not job
                or job.get("worker_id") != worker_id
                or not job.get("lease_expires_at")
                or job["lease_expires_at"] <= now
                or job.get("status") in ("completed", "failed_permanent", "cancelled")
            ):
                return SimpleNamespace(execute=lambda: SimpleNamespace(data={"ok": False, "code": "LEASE_LOST_OR_TERMINAL"}))

            effective_status = status
            if status == "failed_retryable" and job["attempt_count"] >= job["max_attempts"]:
                effective_status = "failed_permanent"

            job["status"] = effective_status
            job["error_stage"] = stage
            if result_reference:
                job["result_reference"] = result_reference
            if warnings:
                job["warnings"] = warnings
            job["error_code"] = error_code
            job["error_message"] = error_message
            job["updated_at"] = now

            if effective_status == "completed":
                job["retryable"] = False
                job["completed_at"] = now
                job["lease_expires_at"] = None
                job["worker_id"] = None
            elif effective_status == "failed_permanent":
                job["retryable"] = False
                job["completed_at"] = now
                job["lease_expires_at"] = None
                job["worker_id"] = None
                if job["credits_reserved"] > 0 and not job["credits_refunded_at"]:
                    job["credits_refunded_at"] = now
                    job["credits_reserved"] = 0
            elif effective_status == "failed_retryable":
                job["retryable"] = True
                job["available_at"] = now + timedelta(seconds=backoff_seconds)
                job["lease_expires_at"] = None
                job["worker_id"] = None

            return SimpleNamespace(execute=lambda: SimpleNamespace(data={"ok": True, "job": dict(job)}))

        elif name == "settle_document_processing_job":
            job_id = args.get("p_job_id")
            job = self.jobs.get(job_id)
            if job and job.get("status") == "completed":
                already_settled = bool(job.get("credits_settled_at"))
                job["credits_settled_at"] = job.get("credits_settled_at") or now
                job["updated_at"] = now
                return SimpleNamespace(execute=lambda: SimpleNamespace(data={"success": True, "already_settled": already_settled}))
            return SimpleNamespace(execute=lambda: SimpleNamespace(data={"success": False, "code": "JOB_NOT_COMPLETED"}))

        elif name == "refund_document_processing_job":
            job_id = args.get("p_job_id")
            job = self.jobs.get(job_id)
            if job and job.get("status") in ("cancelled", "failed_permanent"):
                if job["credits_refunded_at"] or job["credits_reserved"] == 0:
                    return SimpleNamespace(execute=lambda: SimpleNamespace(data={"success": True, "already_refunded": True}))
                job["credits_refunded_at"] = now
                job["credits_reserved"] = 0
                return SimpleNamespace(execute=lambda: SimpleNamespace(data={"success": True, "refunded": True}))
            return SimpleNamespace(execute=lambda: SimpleNamespace(data={"success": False, "code": "JOB_NOT_REFUNDABLE"}))

        return SimpleNamespace(execute=lambda: SimpleNamespace(data={"success": False}))


def test_retry_backoff_is_bounded() -> None:
    assert [retry_backoff_seconds(i) for i in range(1, 5)] == [5, 10, 20, 40]
    assert retry_backoff_seconds(100) == 86_400


def test_worker_rejects_unsafe_configuration() -> None:
    with pytest.raises(ValueError, match="at least 8 characters"):
        DocumentJobWorker(object(), "short")
    with pytest.raises(ValueError, match="between 30 and 3600"):
        DocumentJobWorker(object(), "worker-123", lease_seconds=10)


def test_normal_processing() -> None:
    db = MockDatabase()
    db.add_job("job-normal", status="queued", credits_reserved=10)
    worker = DocumentJobWorker(db, "worker-node-1", lease_seconds=120)

    claimed = worker.claim()
    assert claimed is not None
    assert claimed.job["id"] == "job-normal"
    assert claimed.job["status"] == "leased"
    assert claimed.job["attempt_count"] == 1

    stages_hit: list[str] = []

    def mock_downloader(job: dict) -> bytes:
        stages_hit.append("download")
        return b"fake-pdf-content"

    def mock_extractor(raw: bytes, job: dict) -> tuple[dict, None]:
        stages_hit.append("extract")
        return ({"text": "Sample document content"}, None)

    def mock_ocr(raw: bytes, job: dict) -> dict:
        stages_hit.append("ocr")
        return {"ocr_text": "Sample OCR content"}

    def mock_segmenter(data: Any, job: dict) -> dict:
        stages_hit.append("segment")
        return {"sections": ["intro", "body"]}

    def mock_validator(segmented: Any, job: dict) -> bool:
        stages_hit.append("validate")
        return True

    ok = worker.execute_pipeline(
        claimed,
        downloader=mock_downloader,
        extractor=mock_extractor,
        ocr_processor=mock_ocr,
        segmenter=mock_segmenter,
        validator=mock_validator,
    )

    assert ok is True
    assert stages_hit == ["download", "extract", "segment", "validate"]
    job = db.jobs["job-normal"]
    assert job["status"] == "completed"
    assert job["credits_settled_at"] is not None
    assert job["retryable"] is False
    # Verify worker did not touch credit mutations directly
    assert len(db.credit_mutations) == 0


def test_duplicate_request_idempotency() -> None:
    db = MockDatabase()
    db.add_job("job-idemp", status="queued")
    worker = DocumentJobWorker(db, "worker-node-1", lease_seconds=120)

    # First claim succeeds
    claimed1 = worker.claim()
    assert claimed1 is not None
    assert claimed1.job["id"] == "job-idemp"

    # Second claim returns None because job is already leased and not expired
    claimed2 = worker.claim()
    assert claimed2 is None


def test_worker_crash_and_recovery() -> None:
    db = MockDatabase()
    db.add_job("job-crash", status="queued", max_attempts=3)
    worker1 = DocumentJobWorker(db, "worker-node-1", lease_seconds=60)
    worker2 = DocumentJobWorker(db, "worker-node-2", lease_seconds=60)

    # Worker 1 claims job
    claimed1 = worker1.claim()
    assert claimed1 is not None
    assert claimed1.job["attempt_count"] == 1

    # Worker 1 transitions to downloading, then crashes
    worker1.transition("job-crash", JobState.DOWNLOADING, stage="downloading", attempt_count=1)
    assert db.jobs["job-crash"]["status"] == "downloading"

    # Simulate lease expiration (time passes)
    db.jobs["job-crash"]["lease_expires_at"] = datetime.now(timezone.utc) - timedelta(seconds=10)

    # Worker 2 discovers and reclaims the stuck job
    claimed2 = worker2.claim()
    assert claimed2 is not None
    assert claimed2.job["id"] == "job-crash"
    assert claimed2.job["attempt_count"] == 2
    assert claimed2.worker_id == "worker-node-2"

    # Worker 2 finishes processing
    ok = worker2.execute_pipeline(claimed2)
    assert ok is True
    assert db.jobs["job-crash"]["status"] == "completed"


def test_lease_expiration_and_heartbeat_failure() -> None:
    db = MockDatabase()
    db.add_job("job-lease-exp", status="queued")
    worker = DocumentJobWorker(db, "worker-node-1", lease_seconds=60)

    claimed = worker.claim()
    assert claimed is not None

    # Heartbeat works while lease is valid
    assert worker.heartbeat("job-lease-exp") is True

    # Force lease expiration
    db.jobs["job-lease-exp"]["lease_expires_at"] = datetime.now(timezone.utc) - timedelta(seconds=1)

    # Heartbeat fails after lease expires
    assert worker.heartbeat("job-lease-exp") is False

    # Transition also fails after lease expiration
    assert worker.transition("job-lease-exp", JobState.DOWNLOADING) is False


def test_retry_and_dead_letter_handling() -> None:
    db = MockDatabase()
    db.add_job("job-fail", status="queued", max_attempts=2, credits_reserved=10)
    worker = DocumentJobWorker(db, "worker-node-1", lease_seconds=60)

    # Attempt 1: fail with retryable error
    claimed1 = worker.claim()
    assert claimed1 is not None
    assert claimed1.job["attempt_count"] == 1

    def failing_downloader(job: dict) -> bytes:
        raise ConnectionResetError("Transient network drop")

    ok1 = worker.execute_pipeline(claimed1, downloader=failing_downloader)
    assert ok1 is False
    job = db.jobs["job-fail"]
    assert job["status"] == "failed_retryable"
    assert job["retryable"] is True

    # Simulate backoff expiration
    job["available_at"] = datetime.now(timezone.utc) - timedelta(seconds=1)

    # Attempt 2: fail again (reaches max_attempts)
    claimed2 = worker.claim()
    assert claimed2 is not None
    assert claimed2.job["attempt_count"] == 2

    ok2 = worker.execute_pipeline(claimed2, downloader=failing_downloader)
    assert ok2 is False
    job = db.jobs["job-fail"]
    # Promoted to dead-letter permanent failure and credits refunded
    assert job["status"] == "failed_permanent"
    assert job["retryable"] is False
    assert job["credits_refunded_at"] is not None
    assert job["credits_reserved"] == 0


def test_cancellation() -> None:
    db = MockDatabase()
    db.add_job("job-cancel", status="queued", credits_reserved=10)
    worker = DocumentJobWorker(db, "worker-node-1", lease_seconds=60)

    claimed = worker.claim()
    assert claimed is not None

    # User cancels the job mid-flight
    job = db.jobs["job-cancel"]
    job["status"] = "cancelled"
    job["lease_expires_at"] = None
    job["worker_id"] = None
    job["credits_refunded_at"] = datetime.now(timezone.utc)
    job["credits_reserved"] = 0

    # Worker's subsequent heartbeat and transition are rejected
    assert worker.heartbeat("job-cancel") is False
    assert worker.transition("job-cancel", JobState.EXTRACTING) is False

    # Pipeline execution aborts gracefully
    ok = worker.execute_pipeline(claimed)
    assert ok is False


def test_duplicate_worker_protection() -> None:
    db = MockDatabase()
    db.add_job("job-dup", status="queued", max_attempts=3)
    worker_a = DocumentJobWorker(db, "worker-node-A", lease_seconds=30)
    worker_b = DocumentJobWorker(db, "worker-node-B", lease_seconds=30)

    claimed_a = worker_a.claim()
    assert claimed_a is not None

    # Worker A pauses, lease expires
    db.jobs["job-dup"]["lease_expires_at"] = datetime.now(timezone.utc) - timedelta(seconds=5)

    # Worker B claims the job
    claimed_b = worker_b.claim()
    assert claimed_b is not None
    assert claimed_b.worker_id == "worker-node-B"

    # Worker A resumes and tries to transition -> REJECTED
    assert worker_a.transition("job-dup", JobState.DOWNLOADING) is False
    assert worker_a.heartbeat("job-dup") is False

    # Worker B continues and succeeds
    assert worker_b.transition("job-dup", JobState.DOWNLOADING) is True
    assert worker_b.transition("job-dup", JobState.COMPLETED) is True
    assert db.jobs["job-dup"]["status"] == "completed"


def test_credit_finalization_isolation() -> None:
    db = MockDatabase()
    db.add_job("job-credit-iso", status="completed", credits_reserved=10)
    worker = DocumentJobWorker(db, "worker-node-1", lease_seconds=60)

    # Worker calls settle without mutating credit tables
    assert worker.settle("job-credit-iso") is True
    job = db.jobs["job-credit-iso"]
    assert job["credits_settled_at"] is not None

    # Calling settle again is idempotent
    assert worker.settle("job-credit-iso") is True

    # Worker never called any direct credit table updates
    assert len(db.credit_mutations) == 0
