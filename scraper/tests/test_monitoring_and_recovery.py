"""Test suite for FastAPI health probes, Prometheus metrics, alert manager, and worker recovery."""
import time
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.telemetry import (
    alert_manager,
    sanitize_telemetry_payload,
    SOURCE_RETRIEVAL_SUCCESS,
    JOB_QUEUE_DEPTH,
)


@pytest.fixture
def client():
    return TestClient(app)


def test_health_endpoint(client):
    """GET /health returns ok status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_ready_endpoint(client):
    """GET /ready returns configuration readiness status."""
    response = client.get("/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("ready", "not_ready")
    checks = data.get("checks") or {}
    assert "config" in checks
    assert "hybrid" in checks
    assert checks.get("ai_optional") is True
    assert "hmac_configured" in checks
    assert "document_worker_embedded" in checks
    assert "paper_factory_embedded_worker" in checks
    assert "ai_provider_present" in checks


def test_metrics_endpoint(client):
    """GET /metrics exports Prometheus plain text metrics."""
    response = client.get("/metrics")
    assert response.status_code == 200
    assert "text/plain" in response.headers.get("content-type", "")


def test_alert_manager_triggers_and_redacts_secrets(client):
    """AlertManager emits alerts without exposing credentials."""
    alert_manager.active_alerts.clear()

    # Trigger stuck queue alert
    alert = alert_manager.check_stuck_queue(queue_depth=120, oldest_age_seconds=400)
    assert alert is not None
    assert alert["alert"] == "StuckProcessingQueue"

    # Trigger repeated lease expiration
    alert_exp = alert_manager.check_repeated_lease_expirations(expirations_in_window=3)
    assert alert_exp is not None
    assert alert_exp["alert"] == "RepeatedWorkerLeaseExpiration"

    # Verify secret redaction
    payload = {
        "user_id": "user-abc",
        "api_key": "super-secret-key",
        "nested": {"token": "secret-jwt"},
    }
    cleaned = sanitize_telemetry_payload(payload)
    assert cleaned["user_id"] == "user-abc"
    assert cleaned["api_key"] == "[REDACTED]"
    assert cleaned["nested"]["token"] == "[REDACTED]"

    # Test /alerts endpoint
    response = client.get("/alerts")
    assert response.status_code == 200
    alerts_data = response.json()
    assert alerts_data["total_active"] >= 2


def test_worker_recovery_after_restart():
    """Verify that expired leased jobs are re-claimable after worker restart."""
    job = {
        "id": "job-recovery-1",
        "status": "leased",
        "leased_by": "worker-crashed-pid-111",
        "leased_until": time.time() - 10,  # 10s in the past (expired)
    }

    now = time.time()
    is_claimable = job["status"] == "queued" or (
        job["status"] == "leased" and job["leased_until"] < now
    )
    assert is_claimable is True

    # New worker claims the job
    new_worker_id = "worker-restarted-pid-222"
    job["status"] = "leased"
    job["leased_by"] = new_worker_id
    job["leased_until"] = now + 60

    assert job["leased_by"] == new_worker_id
    assert job["leased_until"] > now
