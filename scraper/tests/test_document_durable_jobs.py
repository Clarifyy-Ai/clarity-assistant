"""Tests for durable document job PostgreSQL helpers."""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.document_intelligence.durable_jobs import (
    acknowledge_durable_job,
    fetch_durable_job,
    job_row_to_response,
)


def _row(**overrides):
    now = datetime.now(timezone.utc).isoformat()
    base = {
        "id": str(uuid4()),
        "document_id": "doc-1",
        "owner_id": "user-1",
        "operation": "parse",
        "status": "queued",
        "result_reference": None,
        "warnings": [],
        "attempt_count": 0,
        "max_attempts": 3,
        "created_at": now,
        "updated_at": now,
        "storage_reference": {},
    }
    base.update(overrides)
    return base


def test_job_row_to_response_includes_correlation_id() -> None:
    row = _row(status="downloading")
    response = job_row_to_response(row, "corr-abc")
    assert response.job_id == row["id"]
    assert response.state.value == "downloading"
    assert response.correlation_id == "corr-abc"
    assert response.success is True


def test_fetch_durable_job_returns_none_when_missing() -> None:
    db = MagicMock()
    chain = db.from_.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute
    chain.return_value = MagicMock(data=None, error=None)
    assert fetch_durable_job(db, str(uuid4())) is None


def test_acknowledge_durable_job_validates_ownership() -> None:
    job_id = str(uuid4())
    row = _row(id=job_id)
    db = MagicMock()
    chain = db.from_.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute
    chain.return_value = MagicMock(data=row, error=None)

    with pytest.raises(HTTPException) as exc:
        acknowledge_durable_job(
            db,
            job_id=job_id,
            document_id="other-doc",
            owner_id="user-1",
            correlation_id="corr-1",
        )
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "JOB_OWNERSHIP_MISMATCH"


def test_acknowledge_durable_job_returns_authoritative_state() -> None:
    job_id = str(uuid4())
    row = _row(id=job_id, status="queued")
    db = MagicMock()
    chain = db.from_.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute
    chain.return_value = MagicMock(data=row, error=None)

    response = acknowledge_durable_job(
        db,
        job_id=job_id,
        document_id="doc-1",
        owner_id="user-1",
        correlation_id="corr-2",
    )
    assert response.job_id == job_id
    assert response.state.value == "queued"
    assert response.correlation_id == "corr-2"
