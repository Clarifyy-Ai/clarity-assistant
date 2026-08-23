from __future__ import annotations

import hashlib
import hmac
import json
import os
import time

os.environ.update(
    {
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "test-service-role-key",
        "SUPABASE_JWKS_URL": "https://example.supabase.co/auth/v1/.well-known/jwks.json",
        "DOCUMENT_INTELLIGENCE_AUTH_SECRET": "x" * 48,
        "SCRAPE_DAILY_ENABLED": "false",
        "APP_ENV": "test",
    }
)

from fastapi.testclient import TestClient

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


def test_health_and_readiness() -> None:
    with TestClient(app) as client:
        health = client.get("/health").json()
        assert health["status"] == "ok"
        assert health.get("service_version") == "1.1.0"
        ready = client.get("/ready").json()
        assert ready["status"] == "ready"
        assert ready.get("service_version") == "1.1.0"
        assert ready.get("checks", {}).get("config") is True
        assert ready.get("checks", {}).get("hybrid") is True


def test_internal_endpoint_requires_hmac() -> None:
    with TestClient(app) as client:
        response = client.post("/internal/jobs/document", json={})
        assert response.status_code == 401
        assert response.json()["detail"]["code"] == "AUTH_REQUIRED"


def test_internal_job_is_idempotent_for_retried_request() -> None:
    body = {
        "document_id": "doc-1",
        "owner_id": "user-1",
        "category": "resume_pdf",
        "storage": {"bucket": "documents", "path": "user-1/doc-1.pdf"},
    }
    raw = json.dumps(body, separators=(",", ":")).encode()
    headers = signed_headers("POST", "/internal/jobs/document", raw, "request-1234")
    with TestClient(app) as client:
        first = client.post("/internal/jobs/document", content=raw, headers=headers)
        second = client.post("/internal/jobs/document", content=raw, headers=headers)
        assert first.status_code == 202
        assert second.status_code == 202
        assert first.json()["job_id"] == second.json()["job_id"]
        job_id = first.json()["job_id"]
        lookup_body = b""
        lookup_headers = signed_headers("GET", f"/internal/jobs/{job_id}", lookup_body, "lookup-1234")
        lookup = client.get(f"/internal/jobs/{job_id}", headers=lookup_headers)
        assert lookup.status_code == 200
        assert lookup.json()["state"] == "queued"


def test_replay_with_changed_body_is_rejected() -> None:
    body = b'{"document_id":"doc-1","owner_id":"user-1","category":"txt","storage":{"bucket":"documents","path":"x.txt"}}'
    headers = signed_headers("POST", "/internal/jobs/document", body, "request-5678")
    changed = body.replace(b"x.txt", b"y.txt")
    with TestClient(app) as client:
        assert client.post("/internal/jobs/document", content=body, headers=headers).status_code == 202
        replay_headers = signed_headers("POST", "/internal/jobs/document", changed, "request-5678")
        replay = client.post("/internal/jobs/document", content=changed, headers=replay_headers)
        assert replay.status_code == 409
        assert replay.json()["detail"]["code"] == "AUTH_REPLAY"
