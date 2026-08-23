"""Liveness, readiness, and alert monitoring endpoints."""
from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.core.telemetry import alert_manager, sanitize_telemetry_payload
from app.hybrid import SERVICE_VERSION

router = APIRouter(tags=["health"])
_START_TIME = time.time()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service_version": SERVICE_VERSION}


@router.get("/ready")
async def ready(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Readiness succeeds when config is present and hybrid operations import cleanly."""
    config_ok = bool(settings.internal_auth_secret and settings.supabase_url)
    hybrid_ok = False
    try:
        from app.hybrid import operations as _hybrid_ops  # noqa: F401
        from app.hybrid.operations import list_supported_operations

        hybrid_ok = len(list_supported_operations()) > 0
    except Exception:  # noqa: BLE001 — readiness must not raise
        hybrid_ok = False

    status = "ready" if config_ok and hybrid_ok else "not_ready"
    return {
        "status": status,
        "service_version": SERVICE_VERSION,
        "checks": {
            "config": config_ok,
            "hybrid": hybrid_ok,
        },
    }


@router.get("/alerts")
async def alerts() -> dict[str, Any]:
    """Returns active monitoring alerts with secrets redacted."""
    return {
        "alerts": sanitize_telemetry_payload(alert_manager.active_alerts),
        "total_active": len(alert_manager.active_alerts),
        "uptime_seconds": int(time.time() - _START_TIME),
    }
