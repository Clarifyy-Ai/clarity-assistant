"""Gov-exam FastAPI routes must bound DB/auth waits (no infinite hang)."""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.core.bounded import await_bounded

ROOT = Path(__file__).resolve().parents[1]


def test_await_bounded_raises_typed_504() -> None:
    async def hang() -> None:
        await asyncio.sleep(5)

    async def run() -> None:
        with pytest.raises(HTTPException) as exc:
            await await_bounded(hang(), 0.05, stage="availability")
        assert exc.value.status_code == 504
        assert exc.value.detail["code"] == "UPSTREAM_TIMEOUT"
        assert exc.value.detail["retryable"] is True
        assert exc.value.detail["stage"] == "availability"

    asyncio.run(run())


def test_await_bounded_returns_value() -> None:
    async def ok() -> str:
        return "ready"

    async def run() -> None:
        assert await await_bounded(ok(), 1.0) == "ready"

    asyncio.run(run())


def test_gov_exam_routes_bound_db_lookups() -> None:
    src = (ROOT / "app/routes/gov_exams.py").read_text(encoding="utf-8")
    assert "await_bounded" in src
    assert "GOV_EXAM_CLAIM_TIMEOUT_SECONDS" in src
    assert "GOV_EXAM_DB_TIMEOUT_SECONDS" in src
    assert src.count("await_bounded") >= 6


def test_paper_factory_routes_bound_db_lookups() -> None:
    src = (ROOT / "app/routes/paper_factory.py").read_text(encoding="utf-8")
    assert "await_bounded" in src
    assert "GOV_EXAM_CLAIM_TIMEOUT_SECONDS" in src


def test_admin_auth_bounds_jwt_and_roles() -> None:
    src = (ROOT / "app/core/security.py").read_text(encoding="utf-8")
    assert "await_bounded" in src
    assert "AUTH_TIMEOUT" in src
    assert "timeout=int(ADMIN_AUTH_TIMEOUT_SECONDS)" in src
    assert "postgrest_client_timeout" in src


def test_python_has_no_typeahead_search_route() -> None:
    routes = (ROOT / "app/routes/gov_exams.py").read_text(encoding="utf-8")
    assert "/search" not in routes
    assert "typeahead" not in routes.lower()
