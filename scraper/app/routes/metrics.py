"""Prometheus metrics endpoint."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.core.internal_auth import require_observability_auth

router = APIRouter(tags=["metrics"])


@router.get("/metrics")
async def metrics(_: None = Depends(require_observability_auth)) -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
