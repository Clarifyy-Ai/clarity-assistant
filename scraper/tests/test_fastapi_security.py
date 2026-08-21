"""FastAPI security test suite: HMAC auth, replay defense, path traversal, and payload bounding."""
import hashlib
import hmac
import time
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.internal_auth import ReplayGuard, require_internal_auth
from app.core.security import (
    IsolatedTempWorkspace,
    sanitize_filename,
    validate_safe_path,
)
from app.main import app


def _generate_hmac_headers(
    method: str,
    path: str,
    body: bytes,
    secret: str,
    request_id: str,
    timestamp: int,
) -> dict[str, str]:
    body_digest = hashlib.sha256(body).hexdigest()
    message = f"{method.upper()}\n{path}\n{timestamp}\n{request_id}\n{body_digest}".encode()
    signature = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return {
        "x-request-id": request_id,
        "x-internal-timestamp": str(timestamp),
        "x-internal-signature": f"sha256={signature}",
    }


@pytest.fixture
def client():
    return TestClient(app)


def test_anonymous_request_rejected(client):
    """Anonymous request without HMAC headers is rejected with 401."""
    response = client.post("/internal/jobs/document", json={"document_id": "doc-1"})
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "AUTH_REQUIRED"


def test_missing_signature_rejected(client):
    """Request with missing signature header is rejected."""
    headers = {
        "x-request-id": "req-valid-id-12345",
        "x-internal-timestamp": str(int(time.time())),
    }
    response = client.post("/internal/jobs/document", json={"document_id": "doc-1"}, headers=headers)
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "AUTH_REQUIRED"


def test_invalid_signature_rejected(client):
    """Request with invalid signature is rejected."""
    headers = {
        "x-request-id": "req-valid-id-12345",
        "x-internal-timestamp": str(int(time.time())),
        "x-internal-signature": "sha256=" + "0" * 64,
    }
    response = client.post("/internal/jobs/document", json={"document_id": "doc-1"}, headers=headers)
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "AUTH_SIGNATURE_INVALID"


def test_expired_timestamp_rejected(client):
    """Request with timestamp outside allowed window is rejected."""
    settings = Settings()
    expired_time = int(time.time()) - (settings.internal_auth_max_skew_seconds + 50)
    body = b'{"document_id":"doc-1"}'
    headers = _generate_hmac_headers(
        "POST",
        "/internal/jobs/document",
        body,
        settings.internal_auth_secret,
        "req-test-expired-12345",
        expired_time,
    )
    headers["content-type"] = "application/json"
    response = client.post("/internal/jobs/document", content=body, headers=headers)
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "AUTH_TIMESTAMP_OUT_OF_RANGE"


def test_replay_request_rejected():
    """Duplicate request_id with different fingerprint is rejected by ReplayGuard."""
    guard = ReplayGuard()
    req_id = "req-unique-id-99999"
    fp1 = "123:abc:sig1"
    fp2 = "123:abc:sig2"

    # First attempt succeeds
    assert guard.check_and_record(req_id, fp1, ttl=60) is True

    # Same request with identical fingerprint is idempotent
    assert guard.check_and_record(req_id, fp1, ttl=60) is True

    # Replay attempt with different fingerprint fails
    assert guard.check_and_record(req_id, fp2, ttl=60) is False


def test_oversized_request_rejected(client):
    """Request with body larger than max limit is rejected with 413."""
    settings = Settings()
    oversized_body = b'{"document_id":"' + (b"A" * (settings.internal_max_request_bytes + 1024)) + b'"}'
    now = int(time.time())
    headers = _generate_hmac_headers(
        "POST",
        "/internal/jobs/document",
        oversized_body,
        settings.internal_auth_secret,
        "req-oversized-12345",
        now,
    )
    headers["content-type"] = "application/json"
    response = client.post("/internal/jobs/document", content=oversized_body, headers=headers)
    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "REQUEST_TOO_LARGE"


def test_arbitrary_local_file_path_traversal_rejected(tmp_path):
    """Path traversal sequences (../, absolute paths) outside base_dir are rejected."""
    safe_base = tmp_path / "safe_storage"
    safe_base.mkdir()

    # Valid relative path
    valid = validate_safe_path(safe_base, "sub/file.pdf")
    assert valid == (safe_base / "sub/file.pdf").resolve()

    # Path traversal ../
    with pytest.raises(HTTPException) as exc_info:
        validate_safe_path(safe_base, "../../etc/passwd")
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == "PATH_TRAVERSAL_DETECTED"


def test_isolated_temp_workspace_cleanup():
    """Isolated temp workspace directory is deleted upon context exit."""
    workspace_path = None
    with IsolatedTempWorkspace(prefix="test_security_") as ws:
        workspace_path = ws
        assert ws.exists()
        test_file = ws / "secret.tmp"
        test_file.write_text("temporary data")
        assert test_file.exists()

    assert not workspace_path.exists()


def test_filename_sanitization():
    """Unsafe filenames with directory traversal sequences and null bytes are sanitized."""
    assert sanitize_filename("../../../malicious.exe") == "malicious.exe"
    assert sanitize_filename("..\\..\\malicious.bat") == "malicious.bat"
    assert sanitize_filename("file\x00with_null.pdf") == "filewith_null.pdf"
    assert sanitize_filename("normal_resume.docx") == "normal_resume.docx"
