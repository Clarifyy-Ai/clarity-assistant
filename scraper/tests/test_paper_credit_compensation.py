"""Credit compensation for gov paper jobs: claim-then-refund, permanent only."""
from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import MagicMock

import pytest

from app.gov_exams import engine as gov_engine
from app.paper_factory.config import FactorySettings
from app.paper_factory.repository import PaperRepository
from app.paper_factory.worker import _compensate as worker_compensate


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
        self.idempotency: dict[str, dict[str, Any]] = {}

    def table(self, name: str) -> Any:
        if name == "gov_paper_generation_jobs":
            return _FakeJobTable(self.jobs)
        if name == "idempotency_log":
            return _FakeIdempotencyTable(self.idempotency)
        raise AssertionError(f"unexpected table {name}")

    def rpc(self, name: str, params: dict[str, Any]) -> MagicMock:
        assert name == "refund_credits"
        self.rpc_calls.append(params)
        chain = MagicMock()
        chain.execute.return_value = MagicMock(data={"success": True})
        return chain


class _FakeIdempotencyTable:
    def __init__(self, store: dict[str, dict[str, Any]]) -> None:
        self.store = store
        self._op: str | None = None
        self._key: str | None = None
        self._payload: dict[str, Any] | None = None

    def select(self, _cols: str) -> "_FakeIdempotencyTable":
        self._op = "select"
        return self

    def upsert(self, payload: dict[str, Any], on_conflict: str = "key") -> "_FakeIdempotencyTable":
        self._op = "upsert"
        self._payload = dict(payload)
        return self

    def eq(self, key: str, value: Any) -> "_FakeIdempotencyTable":
        if key == "key":
            self._key = value
        return self

    def limit(self, _n: int) -> "_FakeIdempotencyTable":
        return self

    def execute(self) -> MagicMock:
        result = MagicMock()
        if self._op == "select":
            row = self.store.get(self._key or "")
            result.data = [dict(row)] if row else []
            return result
        if self._op == "upsert" and self._payload:
            key = str(self._payload["key"])
            self.store[key] = dict(self._payload)
            result.data = [dict(self._payload)]
            return result
        result.data = []
        return result


class _TrackingRepo:
    """In-memory stand-in used by _compensate unit tests."""

    def __init__(self, *, credits_charged: int = 5) -> None:
        self.credits_charged = credits_charged
        self.claims: list[str] = []
        self.refunds: list[dict[str, Any]] = []

    def claim_credits_for_refund(self, job_id: str) -> int:
        self.claims.append(job_id)
        amount = max(0, int(self.credits_charged))
        if amount <= 0:
            return 0
        self.credits_charged = 0
        return amount

    def refund_credits(
        self,
        user_id: str,
        amount: int,
        reason: str,
        *,
        idempotency_key: str | None = None,
    ) -> bool:
        self.refunds.append(
            {
                "user_id": user_id,
                "amount": amount,
                "reason": reason,
                "idempotency_key": idempotency_key,
            }
        )
        return True


# ── Repository: claim + fail_job ──────────────────────────────────────────────


def test_claim_credits_for_refund_zeros_and_returns_amount() -> None:
    jobs = {
        "job-1": {
            "id": "job-1",
            "credits_charged": 5,
            "status": "analyzing_pattern",
        }
    }
    repo = PaperRepository(_settings(), client=_FakeDb(jobs))  # type: ignore[arg-type]
    claimed = repo.claim_credits_for_refund("job-1")
    assert claimed == 5
    assert jobs["job-1"]["credits_charged"] == 0


def test_claim_credits_for_refund_is_idempotent() -> None:
    jobs = {"job-1": {"id": "job-1", "credits_charged": 5}}
    repo = PaperRepository(_settings(), client=_FakeDb(jobs))  # type: ignore[arg-type]
    assert repo.claim_credits_for_refund("job-1") == 5
    assert repo.claim_credits_for_refund("job-1") == 0
    assert jobs["job-1"]["credits_charged"] == 0


def test_fail_job_retryable_does_not_set_completed_at() -> None:
    jobs = {
        "job-1": {
            "id": "job-1",
            "status": "analyzing_pattern",
            "worker_id": "w1",
            "lease_expires_at": "2099-01-01T00:00:00+00:00",
            "completed_at": None,
            "credits_charged": 5,
        }
    }
    repo = PaperRepository(_settings(), client=_FakeDb(jobs))  # type: ignore[arg-type]
    repo.fail_job("job-1", code="TRANSIENT", message="try again", retryable=True)
    row = jobs["job-1"]
    assert row["status"] == "failed_retryable"
    assert row["completed_at"] is None
    assert row["lease_expires_at"] is None
    assert row["worker_id"] is None
    assert row["credits_charged"] == 5


def test_fail_job_permanent_sets_completed_at() -> None:
    jobs = {
        "job-1": {
            "id": "job-1",
            "status": "analyzing_pattern",
            "worker_id": "w1",
            "lease_expires_at": "2099-01-01T00:00:00+00:00",
            "completed_at": None,
            "credits_charged": 5,
        }
    }
    repo = PaperRepository(_settings(), client=_FakeDb(jobs))  # type: ignore[arg-type]
    repo.fail_job("job-1", code="EXAM_NOT_FOUND", message="gone", retryable=False)
    row = jobs["job-1"]
    assert row["status"] == "failed_permanent"
    assert row["completed_at"] is not None
    assert row["lease_expires_at"] is None
    assert row["credits_charged"] == 5  # claim happens in _compensate, not fail_job


# ── _compensate (worker + engine share contract) ──────────────────────────────


@pytest.mark.parametrize(
    "compensate_fn",
    [worker_compensate, gov_engine._compensate],
    ids=["worker", "engine"],
)
def test_permanent_compensate_claims_and_refunds_once(compensate_fn) -> None:
    repo = _TrackingRepo(credits_charged=5)
    job = {"id": "job-abc", "user_id": "user-1", "credits_charged": 5}

    asyncio.run(compensate_fn(job, repo, permanent=True))  # type: ignore[arg-type]

    assert repo.claims == ["job-abc"]
    assert repo.credits_charged == 0
    assert len(repo.refunds) == 1
    assert repo.refunds[0]["amount"] == 5
    assert repo.refunds[0]["reason"] == "refund_paper_job:job-abc"
    assert repo.refunds[0]["idempotency_key"] == "refund_paper_job:job-abc"


@pytest.mark.parametrize(
    "compensate_fn",
    [worker_compensate, gov_engine._compensate],
    ids=["worker", "engine"],
)
def test_retryable_compensate_does_not_refund(compensate_fn) -> None:
    repo = _TrackingRepo(credits_charged=5)
    job = {"id": "job-abc", "user_id": "user-1", "credits_charged": 5}

    asyncio.run(compensate_fn(job, repo, permanent=False))  # type: ignore[arg-type]

    assert repo.claims == []
    assert repo.refunds == []
    assert repo.credits_charged == 5


@pytest.mark.parametrize(
    "compensate_fn",
    [worker_compensate, gov_engine._compensate],
    ids=["worker", "engine"],
)
def test_second_compensate_does_not_double_refund(compensate_fn) -> None:
    repo = _TrackingRepo(credits_charged=5)
    job = {"id": "job-abc", "user_id": "user-1", "credits_charged": 5}

    asyncio.run(compensate_fn(job, repo, permanent=True))  # type: ignore[arg-type]
    asyncio.run(compensate_fn(job, repo, permanent=True))  # type: ignore[arg-type]

    assert repo.claims == ["job-abc", "job-abc"]
    assert len(repo.refunds) == 1
    assert repo.credits_charged == 0


def test_refund_credits_uses_claim_amount_via_repository() -> None:
    """End-to-end-ish: claim zeros the row, refund RPC fires once with Edge key."""
    jobs = {"job-1": {"id": "job-1", "credits_charged": 3, "user_id": "user-1"}}
    db = _FakeDb(jobs)
    repo = PaperRepository(_settings(), client=db)  # type: ignore[arg-type]

    async def run() -> None:
        await worker_compensate(
            {"id": "job-1", "user_id": "user-1", "credits_charged": 3},
            repo,
            permanent=True,
        )
        await worker_compensate(
            {"id": "job-1", "user_id": "user-1", "credits_charged": 3},
            repo,
            permanent=True,
        )

    asyncio.run(run())
    assert jobs["job-1"]["credits_charged"] == 0
    assert len(db.rpc_calls) == 1
    assert db.rpc_calls[0]["p_cost"] == 3
    assert db.rpc_calls[0]["p_reason"] == "refund_paper_job:job-1"
