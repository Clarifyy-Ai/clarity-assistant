"""Liveness, readiness, and alert monitoring endpoints."""
from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import APIRouter, Depends, Request, Response, status

from app.core.config import Settings, get_settings
from app.core.telemetry import alert_manager, sanitize_telemetry_payload
from app.hybrid import SERVICE_VERSION

router = APIRouter(tags=["health"])
_START_TIME = time.time()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service_version": SERVICE_VERSION}


@router.get("/ready")
async def ready(
    request: Request, response: Response, settings: Settings = Depends(get_settings)
) -> dict[str, Any]:
    """Report real configuration and durable-queue dependency readiness."""
    config_ok = bool(settings.internal_auth_secret and settings.supabase_url)
    hybrid_ok = False
    try:
        from app.hybrid import operations as _hybrid_ops  # noqa: F401
        from app.hybrid.operations import list_supported_operations

        hybrid_ok = len(list_supported_operations()) > 0
    except Exception:  # noqa: BLE001 — readiness must not raise
        hybrid_ok = False

    hmac_configured = bool(settings.internal_auth_secret)
    ai_provider_present = False
    factory_config_ok = False
    queue_ok = False
    worker_mode = "unknown"
    worker_runtime_ok = False
    try:
        from app.paper_factory.config import get_factory_settings
        from app.paper_factory.repository import PaperRepository

        factory_settings = get_factory_settings()
        ai_provider_present = factory_settings.has_ai_provider
        worker_mode = factory_settings.worker_mode
        factory_config_ok = not factory_settings.worker_configuration_errors()
        worker_runtime_ok = (
            worker_mode == "dedicated"
            or (
                worker_mode == "embedded"
                and bool(
                    getattr(request.app.state, "paper_factory_worker_running", False)
                )
            )
        )
        if factory_config_ok:
            queue_ok = await asyncio.wait_for(
                asyncio.to_thread(
                    PaperRepository(factory_settings).check_connection
                ),
                timeout=3.0,
            )
    except Exception:  # noqa: BLE001 — readiness must not raise
        queue_ok = False

    ready_ok = (
        config_ok
        and hybrid_ok
        and factory_config_ok
        and queue_ok
        and worker_runtime_ok
    )
    readiness_status = "ready" if ready_ok else "not_ready"
    if not ready_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": readiness_status,
        "service_version": SERVICE_VERSION,
        "checks": {
            "config": config_ok,
            "hybrid": hybrid_ok,
            "factory_config": factory_config_ok,
            "paper_factory_queue": queue_ok,
            "paper_factory_worker_mode": worker_mode,
            "paper_factory_worker_runtime": worker_runtime_ok,
            # Informational only — must not flip ready/not_ready.
            "hmac_configured": hmac_configured,
            "document_worker_embedded": bool(settings.document_worker_embedded),
            "paper_factory_embedded_worker": bool(settings.paper_factory_embedded_worker),
            "ai_optional": True,
            "ai_provider_present": ai_provider_present,
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
