"""Tests for publishing user resolution."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from app.paper_factory.config import FactorySettings
from app.paper_factory.system_user import ensure_system_user_id, resolve_system_user_id


def _settings(**overrides: str) -> FactorySettings:
    base = {
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "service-role",
    }
    base.update(overrides)
    return FactorySettings(**base)  # type: ignore[arg-type]


def test_resolve_uses_valid_system_user_id() -> None:
    user_id = str(uuid.uuid4())
    settings = _settings(SYSTEM_USER_ID=user_id)
    assert resolve_system_user_id(settings) == user_id


def test_resolve_from_email_when_uuid_missing() -> None:
    user_id = str(uuid.uuid4())
    settings = _settings(
        SYSTEM_USER_ID="",
        SYSTEM_USER_EMAIL="qa.admin@clarify.ai.test",
    )
    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"id": user_id}
    )
    with patch(
        "app.paper_factory.system_user.create_bounded_supabase_client",
        return_value=mock_client,
    ):
        assert resolve_system_user_id(settings) == user_id


def test_ensure_system_user_id_mutates_settings() -> None:
    user_id = str(uuid.uuid4())
    settings = _settings(
        SYSTEM_USER_ID="",
        SYSTEM_USER_EMAIL="qa.admin@clarify.ai.test",
    )
    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"id": user_id}
    )
    with patch(
        "app.paper_factory.system_user.create_bounded_supabase_client",
        return_value=mock_client,
    ):
        ensure_system_user_id(settings)
    assert settings.system_user_id == user_id
    assert not settings.worker_configuration_errors()
