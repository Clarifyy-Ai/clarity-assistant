"""Focused contracts for gov-exam HMAC routes and durable worker hardening."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import time
import uuid
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.gov_exams.engine import process_gov_exam_job
from app.main import app
from app.paper_factory.config import FactorySettings
from app.paper_factory.repository import PaperRepository


def _headers(method: str, path: str, body: bytes = b"") -> dict[str, str]:
    settings = get_settings()
    timestamp = int(time.time())
    request_id = f"gov-route-{uuid.uuid4().hex}"
    digest = hashlib.sha256(body).hexdigest()
    message = (
        f"{method.upper()}\n{path}\n{timestamp}\n{request_id}\n{digest}".encode()
    )
    signature = hmac.new(
        settings.internal_auth_secret.encode(), message, hashlib.sha256
    ).hexdigest()
    return {
        "x-request-id": request_id,
        "x-internal-timestamp": str(timestamp),
        "x-internal-signature": f"sha256={signature}",
        "content-type": "application/json",
    }


def test_gov_health_rejects_missing_hmac() -> None:
    response = TestClient(app).get("/internal/gov-exams/health")
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "AUTH_REQUIRED"


def test_gov_health_hmac_reports_queue_truth() -> None:
    settings = MagicMock()
    settings.has_ai_provider = True
    settings.worker_mode = "dedicated"
    settings.worker_queue = "python_paper_factory"
    settings.lease_seconds = 180
    settings.worker_configuration_errors.return_value = []
    repo = MagicMock()
    repo.check_connection.return_value = True
    path = "/internal/gov-exams/health"
    with patch("app.routes.gov_exams.get_factory_settings", return_value=settings):
        with patch("app.routes.gov_exams.PaperRepository", return_value=repo):
            response = TestClient(app).get(path, headers=_headers("GET", path))
    assert response.status_code == 200
    assert response.json()["worker_queue"] == "python_paper_factory"
    assert response.headers["x-request-id"].startswith("gov-route-")


def test_malformed_signed_json_has_structured_correlation_error() -> None:
    path = "/internal/gov-exams/process-job"
    body = b'{"job_id":'
    response = TestClient(app).post(
        path, content=body, headers=_headers("POST", path, body)
    )
    payload = response.json()
    assert response.status_code == 422
    assert payload["error"]["code"] == "REQUEST_VALIDATION_FAILED"
    assert payload["error"]["correlation_id"] == response.headers["x-request-id"]


def test_process_route_fails_fast_when_queue_is_unavailable() -> None:
    path = "/internal/gov-exams/process-job"
    body = b'{"job_id":"job-queue-down"}'
    repo = MagicMock()
    repo.get_job.side_effect = OSError("database offline")
    with patch("app.routes.gov_exams.get_factory_settings", return_value=MagicMock()):
        with patch("app.routes.gov_exams.PaperRepository", return_value=repo):
            response = TestClient(app).post(
                path, content=body, headers=_headers("POST", path, body)
            )
    payload = response.json()["detail"]
    assert response.status_code == 503
    assert payload["code"] == "WORKER_UNAVAILABLE"
    assert payload["correlation_id"] == response.headers["x-request-id"]


def test_malformed_job_row_fails_permanently_with_correlation() -> None:
    repo = MagicMock()
    settings = MagicMock(job_timeout_seconds=1, heartbeat_interval_seconds=0.1)
    result = asyncio.run(
        process_gov_exam_job(
            {"id": "job-malformed", "exam_id": "exam-1", "request_json": "bad"},
            settings=settings,
            repo=repo,
            correlation_id="corr-malformed",
        )
    )
    assert result.error_code == "MALFORMED_JOB_PAYLOAD"
    assert result.retryable is False
    assert result.correlation_id == "corr-malformed"
    repo.fail_job.assert_called_once()


def test_overall_timeout_marks_job_retryable() -> None:
    async def never_finishes(*_args, **_kwargs):
        await asyncio.sleep(10)

    repo = MagicMock()
    settings = MagicMock(job_timeout_seconds=0.02, heartbeat_interval_seconds=1)
    job = {
        "id": "job-timeout",
        "exam_id": "exam-1",
        "mode": "generated_mock",
        "request_json": {},
    }
    with patch("app.gov_exams.engine._process_gov_exam_job", side_effect=never_finishes):
        result = asyncio.run(
            process_gov_exam_job(
                job, settings=settings, repo=repo, correlation_id="corr-timeout"
            )
        )
    assert result.error_code == "JOB_TIMEOUT"
    assert result.retryable is True
    repo.fail_job.assert_called_once()


def test_periodic_heartbeat_failure_stops_long_job() -> None:
    async def long_phase(*_args, **_kwargs):
        await asyncio.sleep(10)

    repo = MagicMock()
    repo.heartbeat.side_effect = OSError("queue offline")
    settings = MagicMock(job_timeout_seconds=1, heartbeat_interval_seconds=0.01)
    job = {
        "id": "job-heartbeat",
        "exam_id": "exam-1",
        "mode": "generated_mock",
        "request_json": {},
    }
    with patch("app.gov_exams.engine._process_gov_exam_job", side_effect=long_phase):
        result = asyncio.run(process_gov_exam_job(job, settings=settings, repo=repo))
    assert result.error_code == "WORKER_UNAVAILABLE"
    assert result.retryable is True


def test_expired_lease_can_be_reclaimed_after_restart() -> None:
    repo = PaperRepository.__new__(PaperRepository)
    repo.settings = MagicMock(max_job_attempts=3)
    repo.get_job = MagicMock(
        return_value={
            "id": "job-restart",
            "status": "analyzing_pattern",
            "attempt_count": 1,
            "lease_expires_at": "2000-01-01T00:00:00+00:00",
            "request_json": {"generator": "python_paper_factory"},
        }
    )
    repo._claim = MagicMock(return_value={"id": "job-restart", "attempt_count": 2})
    claimed = repo.claim_job("job-restart", "worker-after-restart")
    assert claimed == {"id": "job-restart", "attempt_count": 2}
    repo._claim.assert_called_once()


def test_worker_configuration_requires_publishing_identity() -> None:
    settings = FactorySettings(
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY="service-role",
        SYSTEM_USER_ID="",
        PAPER_FACTORY_WORKER_MODE="embedded",
    )
    assert any("SYSTEM_USER_ID" in item for item in settings.worker_configuration_errors())


def test_queue_routing_is_explicit() -> None:
    repo = PaperRepository.__new__(PaperRepository)
    repo.settings = MagicMock(worker_queue="python_paper_factory")
    assert repo._wants_python_factory(
        {
            "request_json": {
                "generator": "python_paper_factory",
                "workerQueue": "python_paper_factory",
            }
        }
    )
    assert not repo._wants_python_factory(
        {
            "request_json": {
                "generator": "python_paper_factory",
                "workerQueue": "another_queue",
            }
        }
    )
