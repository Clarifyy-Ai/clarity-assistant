"""Tests for POST /v1/process unified processing endpoint."""

from __future__ import annotations

import hashlib
import hmac
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

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import app


def _hmac_headers(method: str, path: str, body: bytes, secret: str, request_id: str, ts: int) -> dict[str, str]:
    digest = hashlib.sha256(body).hexdigest()
    message = f"{method.upper()}\n{path}\n{ts}\n{request_id}\n{digest}".encode()
    signature = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return {
        "x-request-id": request_id,
        "x-internal-timestamp": str(ts),
        "x-internal-signature": f"sha256={signature}",
        "content-type": "application/json",
    }


@pytest.fixture
def client():
    return TestClient(app)


def test_process_document_classify_success(client):
    settings = Settings()
    body = (
        b'{"operation":"document_classify","operation_id":"op-1","correlation_id":"corr-1",'
        b'"payload":{"text":"John Doe\\nEmail: jane@example.com\\nSkills: Python, FastAPI\\nExperience: Built APIs"}}'
    )
    headers = _hmac_headers(
        "POST",
        "/v1/process",
        body,
        settings.internal_auth_secret,
        "req-process-classify-1",
        int(time.time()),
    )
    response = client.post("/v1/process", content=body, headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["source"] == "python"
    assert payload["data"]["detected_document_type"] == "RESUME"


def test_process_star_evidence_requires_input(client):
    settings = Settings()
    body = (
        b'{"operation":"star_evidence","operation_id":"op-2","correlation_id":"corr-2",'
        b'"payload":{"situation":"","task":"","action":"","result":""}}'
    )
    headers = _hmac_headers(
        "POST",
        "/v1/process",
        body,
        settings.internal_auth_secret,
        "req-process-star-1",
        int(time.time()),
    )
    response = client.post("/v1/process", content=body, headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is False
    assert payload["code"] == "STAR_INPUT_REQUIRED"


def test_process_mock_question_no_safe_fallback(client):
    settings = Settings()
    body = (
        b'{"operation":"mock_question_validate","operation_id":"op-3","correlation_id":"corr-3",'
        b'"payload":{"questions":[],"bank_candidates":[]}}'
    )
    headers = _hmac_headers(
        "POST",
        "/v1/process",
        body,
        settings.internal_auth_secret,
        "req-process-mock-1",
        int(time.time()),
    )
    response = client.post("/v1/process", content=body, headers=headers)
    payload = response.json()
    assert payload["success"] is False
    assert payload["code"] == "NO_SAFE_FALLBACK"
