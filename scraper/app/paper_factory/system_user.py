"""Resolve the publishing user id for generated question rows."""
from __future__ import annotations

from uuid import UUID

from app.core.logger import get_logger
from app.core.security import create_bounded_supabase_client
from app.paper_factory.config import FactorySettings

log = get_logger("paper_factory.system_user")


def _is_valid_uuid(value: str | None) -> bool:
    if not value or not str(value).strip():
        return False
    try:
        UUID(str(value).strip())
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def resolve_system_user_id(settings: FactorySettings) -> str:
    """Return a publishing user UUID from SYSTEM_USER_ID or SYSTEM_USER_EMAIL."""
    direct = (settings.system_user_id or "").strip()
    if _is_valid_uuid(direct):
        return direct

    email = (settings.system_user_email or "").strip().lower()
    if not email:
        return direct

    try:
        client = create_bounded_supabase_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
        response = (
            client.table("profiles")
            .select("id")
            .eq("email", email)
            .maybe_single()
            .execute()
        )
        row = response.data
        if row and row.get("id") and _is_valid_uuid(str(row["id"])):
            resolved = str(row["id"]).strip()
            log.info("system_user_resolved_from_email", email=email, user_id=resolved)
            return resolved
    except Exception as exc:  # noqa: BLE001 — startup must log, not crash here
        log.warning(
            "system_user_email_lookup_failed",
            email=email,
            error=str(exc)[:200],
        )

    return direct


def ensure_system_user_id(settings: FactorySettings) -> FactorySettings:
    """Mutate settings in-place when email fallback resolves a publishing user."""
    resolved = resolve_system_user_id(settings)
    if resolved and resolved != settings.system_user_id:
        settings.system_user_id = resolved
    return settings
