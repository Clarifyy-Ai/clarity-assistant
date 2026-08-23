"""HMAC-protected hybrid operations endpoints."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.internal_auth import InternalRequest, require_internal_auth
from app.core.logger import get_logger
from app.hybrid import SERVICE_VERSION
from app.hybrid.operations import UnsupportedOperation, list_supported_operations, run_operation
from app.hybrid.router_logic import decide_capabilities

router = APIRouter(prefix="/internal/operations", tags=["hybrid-operations"])
log = get_logger("hybrid.operations")


class OperationRequest(BaseModel):
    operation_type: str = Field(..., min_length=1, max_length=128)
    operation_id: str = Field(..., min_length=1, max_length=128)
    correlation_id: str = Field(..., min_length=1, max_length=128)
    user_context_hash: str | None = Field(default=None, max_length=128)
    payload: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str | None = Field(default=None, max_length=256)


def _truncate_for_log(value: Any, limit: int = 200) -> Any:
    """Never log secrets or full resume text — truncate payloads for structured logs."""
    if value is None:
        return None
    if isinstance(value, str):
        return value if len(value) <= limit else f"{value[:limit]}…"
    if isinstance(value, dict):
        return {str(k): _truncate_for_log(v, limit) for k, v in list(value.items())[:40]}
    if isinstance(value, list):
        return [_truncate_for_log(item, limit) for item in value[:20]]
    return value


def _base_log_fields(
    *,
    request_id: str,
    correlation_id: str,
    operation_id: str,
    operation_type: str,
) -> dict[str, Any]:
    return {
        "request_id": request_id,
        "correlation_id": correlation_id,
        "operation_id": operation_id,
        "operation_type": operation_type,
        "service_version": SERVICE_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/supported")
async def supported_operations(
    auth: InternalRequest = Depends(require_internal_auth),
) -> dict[str, Any]:
    ops = list_supported_operations()
    log.info(
        "SUPPORTED_LISTED",
        request_id=auth.request_id,
        service_version=SERVICE_VERSION,
        count=len(ops),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
    return {
        "success": True,
        "source": "python",
        "service_version": SERVICE_VERSION,
        "operations": ops,
        "capabilities": {op: decide_capabilities(op) for op in ops},
    }


@router.post("")
@router.post("/")
async def execute_operation(
    body: OperationRequest,
    auth: InternalRequest = Depends(require_internal_auth),
) -> JSONResponse:
    started = time.perf_counter()
    fields = _base_log_fields(
        request_id=auth.request_id,
        correlation_id=body.correlation_id,
        operation_id=body.operation_id,
        operation_type=body.operation_type,
    )

    log.info(
        "REQUEST_RECEIVED",
        **fields,
        user_context_hash=body.user_context_hash,
        idempotency_key=body.idempotency_key,
        payload=_truncate_for_log(body.payload),
    )
    log.info("AUTH_VALIDATED", **fields)

    capabilities = decide_capabilities(body.operation_type)
    log.info("OPERATION_STARTED", **fields, capabilities=capabilities)

    if not capabilities.get("supported"):
        log.error(
            "ERROR",
            **fields,
            code="UNSUPPORTED_OPERATION",
            message=f"Unsupported operation_type: {body.operation_type}",
        )
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "code": "UNSUPPORTED_OPERATION",
                "message": f"Unsupported operation_type: {body.operation_type}",
                "retryable": False,
                "correlation_id": body.correlation_id,
                "operation_id": body.operation_id,
            },
        )

    try:
        log.info("PROCESSING", **fields, capabilities=capabilities)
        data = run_operation(body.operation_type, body.payload)
        execution_ms = int((time.perf_counter() - started) * 1000)
        log.info(
            "RESULT",
            **fields,
            execution_ms=execution_ms,
            result_keys=list(data.keys()) if isinstance(data, dict) else None,
        )
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "source": "python",
                "operation_id": body.operation_id,
                "correlation_id": body.correlation_id,
                "data": data,
                "service_version": SERVICE_VERSION,
                "execution_ms": execution_ms,
            },
        )
    except UnsupportedOperation as exc:
        log.error("ERROR", **fields, code="UNSUPPORTED_OPERATION", message=str(exc))
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "code": "UNSUPPORTED_OPERATION",
                "message": str(exc),
                "retryable": False,
                "correlation_id": body.correlation_id,
                "operation_id": body.operation_id,
            },
        )
    except Exception as exc:  # noqa: BLE001 — surface as structured failure
        execution_ms = int((time.perf_counter() - started) * 1000)
        log.error(
            "ERROR",
            **fields,
            code="PYTHON_PROCESSING_FAILED",
            message=str(exc)[:500],
            execution_ms=execution_ms,
            retryable=True,
        )
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "code": "PYTHON_PROCESSING_FAILED",
                "message": "Hybrid operation processing failed.",
                "retryable": True,
                "correlation_id": body.correlation_id,
                "operation_id": body.operation_id,
            },
        )
