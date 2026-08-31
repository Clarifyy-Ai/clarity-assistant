"""Credit compensation: Python never mutates user balances; fail_job is status-only."""
from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

from app.gov_exams import engine as gov_engine
from app.paper_factory.config import FactorySettings
from app.paper_factory.repository import PaperRepository
from app.paper_factory import worker as paper_worker


def _settings() -> FactorySettings:
    return FactorySettings(
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY="service-role-key",
    )  # type: ignore[arg-type]


class _FakeJobTable:
    """Minimal PostgREST-style chain for gov_paper_generation_jobs."""

    def __init__(self, jobs: dict[str, dict[str, Any]]) -> None:
        self.jobs = jobs
        self._filters: dict[str, Any] = {}
        self._op: str | None = None
        self._payload: dict[str, Any] | None = None
        self._select_cols: str | None = None

    def select(self, _cols: str) -> "_FakeJobTable":
        self._op = "select"
        self._select_cols = _cols
        return self

    def update(self, payload: dict[str, Any]) -> "_FakeJobTable":
        self._op = "update"
        self._payload = dict(payload)
        return self

    def eq(self, key: str, value: Any) -> "_FakeJobTable":
        self._filters[key] = value
        return self

    def is_(self, key: str, value: Any) -> "_FakeJobTable":
        self._filters[f"is:{key}"] = value
        return self

    def limit(self, _n: int) -> "_FakeJobTable":
        return self

    def execute(self) -> MagicMock:
        job_id = self._filters.get("id")
        result = MagicMock()
        if self._op == "select":
            row = self.jobs.get(job_id)
            result.data = [dict(row)] if row else []
            return result

        if self._op == "update":
            row = self.jobs.get(job_id)
            if not row:
                result.data = []
                return result
            for key, expected in self._filters.items():
                if key == "id":
                    continue
                if key.startswith("is:"):
                    col = key[3:]
                    actual = row.get(col)
                    if expected == "null":
                        if actual is not None:
                            result.data = []
                            return result
                        continue
                    if actual != expected:
                        result.data = []
                        return result
                    continue
                if row.get(key) != expected:
                    result.data = []
                    return result
            assert self._payload is not None
            row.update(self._payload)
            result.data = [dict(row)]
            return result

        result.data = []
        return result


class _FakeDb:
    def __init__(self, jobs: dict[str, dict[str, Any]]) -> None:
        self.jobs = jobs
        self.rpc_calls: list[dict[str, Any]] = []

    def table(self, name: str) -> Any:
        if name == "gov_paper_generation_jobs":
            return _FakeJobTable(self.jobs)
        raise AssertionError(f"unexpected table {name}")

    def rpc(self, name: str, params: dict[str, Any]) -> MagicMock:
        self.rpc_calls.append({"name": name, **params})
        chain = MagicMock()
        chain.execute.return_value = MagicMock(data={"success": True})
        return chain


def test_python_modules_do_not_expose_credit_compensation() -> None:
    assert not hasattr(gov_engine, "_compensate")
    assert not hasattr(paper_worker, "_compensate")


def test_exact_modes_include_full_mock_and_official() -> None:
    assert "official_previous" in gov_engine.EXACT_MODES
    assert "generated_mock" in gov_engine.EXACT_MODES
    assert "custom_mock" not in gov_engine.EXACT_MODES


def test_fail_job_retryable_does_not_set_completed_at_or_refund() -> None:
    jobs = {
        "job-1": {
            "id": "job-1",
            "status": "analyzing_pattern",
            "worker_id": "w1",
            "lease_expires_at": "2099-01-01T00:00:00+00:00",
            "completed_at": None,
            "credits_charged": 5,
            "credits_reserved": 5,
        }
    }
    db = _FakeDb(jobs)
    repo = PaperRepository(_settings(), client=db)  # type: ignore[arg-type]
    repo.fail_job("job-1", code="TRANSIENT", message="try again", retryable=True)
    row = jobs["job-1"]
    assert row["status"] == "failed_retryable"
    assert row["completed_at"] is None
    assert row["lease_expires_at"] is None
    assert row["worker_id"] is None
    assert row["credits_charged"] == 5
    assert row["credits_reserved"] == 5
    assert db.rpc_calls == []


def test_fail_job_permanent_does_not_refund() -> None:
    jobs = {
        "job-1": {
            "id": "job-1",
            "status": "analyzing_pattern",
            "worker_id": "w1",
            "lease_expires_at": "2099-01-01T00:00:00+00:00",
            "completed_at": None,
            "credits_charged": 5,
            "credits_reserved": 5,
        }
    }
    db = _FakeDb(jobs)
    repo = PaperRepository(_settings(), client=db)  # type: ignore[arg-type]
    repo.fail_job("job-1", code="EXAM_NOT_FOUND", message="gone", retryable=False)
    row = jobs["job-1"]
    assert row["status"] == "failed_permanent"
    assert row["completed_at"] is not None
    assert row["credits_charged"] == 5
    assert row["credits_reserved"] == 5
    assert db.rpc_calls == []


def test_claim_credits_for_refund_zeros_and_returns_amount() -> None:
    jobs = {
        "job-1": {
            "id": "job-1",
            "credits_charged": 5,
            "credits_reserved": 5,
            "credits_released_at": None,
            "status": "analyzing_pattern",
        }
    }
    repo = PaperRepository(_settings(), client=_FakeDb(jobs))  # type: ignore[arg-type]
    claimed = repo.claim_credits_for_refund("job-1")
    assert claimed == 5
    assert jobs["job-1"]["credits_charged"] == 0
    assert jobs["job-1"]["credits_reserved"] == 0
    assert jobs["job-1"]["credits_released_at"] is not None


def test_claim_credits_for_refund_is_idempotent() -> None:
    jobs = {
        "job-1": {
            "id": "job-1",
            "credits_charged": 5,
            "credits_reserved": 5,
            "credits_released_at": None,
        }
    }
    repo = PaperRepository(_settings(), client=_FakeDb(jobs))  # type: ignore[arg-type]
    assert repo.claim_credits_for_refund("job-1") == 5
    assert repo.claim_credits_for_refund("job-1") == 0
    assert jobs["job-1"]["credits_charged"] == 0
