from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

os.environ.update(
    {
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "test-service-role-key",
        "SUPABASE_JWKS_URL": "https://example.supabase.co/auth/v1/.well-known/jwks.json",
        "DOCUMENT_INTELLIGENCE_AUTH_SECRET": "x" * 48,
        "SCRAPE_DAILY_ENABLED": "false",
        "APP_ENV": "test",
        # Dummy publishing UUID so FactorySettings fail-closed checks pass in unit tests.
        # Production still requires a real auth user UUID via SYSTEM_USER_ID.
        "SYSTEM_USER_ID": "00000000-0000-4000-8000-000000000001",
        "DOCUMENT_WORKER_EMBEDDED": "false",
        "PAPER_FACTORY_EMBEDDED_WORKER": "false",
    }
)

from fastapi.testclient import TestClient

from app.core.security import supabase_admin
from app.main import app


def signed_headers(method: str, path: str, body: bytes, request_id: str) -> dict[str, str]:
    timestamp = str(int(time.time()))
    digest = hashlib.sha256(body).hexdigest()
    message = "\n".join((method, path, timestamp, request_id, digest)).encode()
    signature = hmac.new(("x" * 48).encode(), message, hashlib.sha256).hexdigest()
    return {
        "content-type": "application/json",
        "x-internal-timestamp": timestamp,
        "x-request-id": request_id,
        "x-internal-signature": f"sha256={signature}",
    }


def _durable_job_row(
    *,
    job_id: str,
    document_id: str = "doc-1",
    owner_id: str = "user-1",
    status: str = "queued",
) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": job_id,
        "document_id": document_id,
        "owner_id": owner_id,
        "operation": "parse",
        "status": status,
        "result_reference": None,
        "warnings": [],
        "error_code": None,
        "error_message": None,
        "error_stage": None,
        "retryable": True,
        "attempt_count": 0,
        "max_attempts": 3,
        "created_at": now,
        "updated_at": now,
        "completed_at": None,
        "storage_reference": {
            "bucket": "documents",
            "path": f"{owner_id}/library/{document_id}.pdf",
            "mime_type": "application/pdf",
            "file_category": "resume_pdf",
        },
    }


@pytest.fixture
def durable_job_store(monkeypatch: pytest.MonkeyPatch):
    rows: dict[str, dict] = {}
    mock_db = MagicMock()

    def fetch(db, job_id: str):
        return rows.get(job_id)

    def acknowledge(db, *, job_id: str, document_id: str, owner_id: str, correlation_id: str):
        from app.document_intelligence.durable_jobs import job_row_to_response

        row = rows.get(job_id)
        if not row:
            from fastapi import HTTPException, status

            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": "JOB_NOT_FOUND",
                    "message": "Processing job was not found in the durable queue.",
                    "retryable": False,
                    "stage": "job_lookup",
                    "correlation_id": correlation_id,
                },
            )
        if row["document_id"] != document_id or row["owner_id"] != owner_id:
            from fastapi import HTTPException, status

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "JOB_OWNERSHIP_MISMATCH",
                    "message": "Job identifiers do not match the durable record.",
                    "retryable": False,
                    "stage": "ownership",
                    "correlation_id": correlation_id,
                },
            )
        return job_row_to_response(row, correlation_id)

    monkeypatch.setattr("app.routes.document_intelligence.fetch_durable_job", fetch)
    monkeypatch.setattr("app.routes.document_intelligence.acknowledge_durable_job", acknowledge)
    app.dependency_overrides[supabase_admin] = lambda: mock_db
    yield rows
    app.dependency_overrides.clear()


def test_health_and_readiness() -> None:
    with TestClient(app) as client:
        health = client.get("/health").json()
        assert health["status"] == "ok"
        assert health.get("service_version") == "1.1.0"
        ready = client.get("/ready").json()
        assert ready.get("service_version") == "1.1.0"
        assert ready.get("checks", {}).get("config") is True
        assert ready.get("checks", {}).get("hybrid") is True
        # Local dummy Supabase keys cannot probe the durable queue; production
        # /ready still requires factory_config + queue + worker runtime.
        assert ready["status"] in {"ready", "not_ready"}


def test_internal_endpoint_requires_hmac() -> None:
    with TestClient(app) as client:
        response = client.post("/internal/jobs/document", json={})
        assert response.status_code == 401
        assert response.json()["detail"]["code"] == "AUTH_REQUIRED"


def test_durable_document_job_ack_is_idempotent(durable_job_store) -> None:
    job_id = str(uuid4())
    durable_job_store[job_id] = _durable_job_row(job_id=job_id)
    body = {
        "job_id": job_id,
        "document_id": "doc-1",
        "owner_id": "user-1",
        "operation": "parse",
        "correlation_id": "request-1234",
        "storage_reference": durable_job_store[job_id]["storage_reference"],
    }
    raw = json.dumps(body, separators=(",", ":")).encode()
    headers = signed_headers("POST", "/internal/jobs/document", raw, "request-1234")
    with TestClient(app) as client:
        first = client.post("/internal/jobs/document", content=raw, headers=headers)
        second = client.post("/internal/jobs/document", content=raw, headers=headers)
        assert first.status_code == 202
        assert second.status_code == 202
        assert first.json()["job_id"] == job_id
        assert second.json()["job_id"] == job_id
        assert first.json()["state"] == "queued"

        lookup_body = b""
        lookup_headers = signed_headers("GET", f"/internal/jobs/{job_id}", lookup_body, "lookup-1234")
        lookup = client.get(f"/internal/jobs/{job_id}", headers=lookup_headers)
        assert lookup.status_code == 200
        assert lookup.json()["job_id"] == job_id
        assert lookup.json()["state"] == "queued"


def test_durable_document_job_rejects_missing_job_id(durable_job_store) -> None:
    body = {"document_id": "doc-1", "owner_id": "user-1"}
    raw = json.dumps(body, separators=(",", ":")).encode()
    headers = signed_headers("POST", "/internal/jobs/document", raw, "request-missing")
    with TestClient(app) as client:
        response = client.post("/internal/jobs/document", content=raw, headers=headers)
        assert response.status_code == 422


def test_durable_document_job_rejects_unknown_job(durable_job_store) -> None:
    job_id = str(uuid4())
    body = {
        "job_id": job_id,
        "document_id": "doc-1",
        "owner_id": "user-1",
        "operation": "parse",
    }
    raw = json.dumps(body, separators=(",", ":")).encode()
    headers = signed_headers("POST", "/internal/jobs/document", raw, "request-unknown")
    with TestClient(app) as client:
        response = client.post("/internal/jobs/document", content=raw, headers=headers)
        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "JOB_NOT_FOUND"


def test_replay_with_changed_body_is_rejected(durable_job_store) -> None:
    job_id = str(uuid4())
    durable_job_store[job_id] = _durable_job_row(job_id=job_id, document_id="doc-1")
    body = {
        "job_id": job_id,
        "document_id": "doc-1",
        "owner_id": "user-1",
        "operation": "parse",
        "storage_reference": {"bucket": "documents", "path": "user-1/library/x.txt"},
    }
    raw = json.dumps(body, separators=(",", ":")).encode()
    headers = signed_headers("POST", "/internal/jobs/document", raw, "request-5678")
    changed = json.dumps(
        {**body, "storage_reference": {"bucket": "documents", "path": "user-1/library/y.txt"}},
        separators=(",", ":"),
    ).encode()
    with TestClient(app) as client:
        assert client.post("/internal/jobs/document", content=raw, headers=headers).status_code == 202
        replay_headers = signed_headers("POST", "/internal/jobs/document", changed, "request-5678")
        replay = client.post("/internal/jobs/document", content=changed, headers=replay_headers)
        assert replay.status_code == 409
        assert replay.json()["detail"]["code"] == "AUTH_REPLAY"
