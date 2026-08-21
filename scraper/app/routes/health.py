"""Liveness, readiness, and alert monitoring endpoints."""
from __future__ import annotations

import os
import time
from typing import Any
from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.core.telemetry import alert_manager, sanitize_telemetry_payload

router = APIRouter(tags=["health"])
_START_TIME = time.time()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
async def ready(settings: Settings = Depends(get_settings)) -> dict[str, str]:
    """Readiness only succeeds when required service configuration is present."""
    if not settings.internal_auth_secret or not settings.supabase_url:
        return {"status": "not_ready"}
    return {"status": "ready"}


@router.get("/alerts")
async def alerts() -> dict[str, Any]:
    """Returns active monitoring alerts with secrets redacted."""
    return {
        "alerts": sanitize_telemetry_payload(alert_manager.active_alerts),
        "total_active": len(alert_manager.active_alerts),
    }
