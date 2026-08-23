"""Unified deterministic processing endpoint for Edge Functions."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, status

from app.core.internal_auth import InternalRequest, require_internal_auth
from app.core.logger import get_logger
from app.engines.company_normalize import run_company_normalize
from app.engines.document_extract import run_document_classify, run_document_extract
from app.engines.mock_question_validate import run_mock_question_validate
from app.engines.practice_coach import run_practice_coach
from app.engines.schemas import (
    EngineError,
    ProcessFailureResponse,
    ProcessOperation,
    ProcessRequest,
    ProcessSuccessResponse,
)
from app.engines.speech_process import run_speech_process
from app.engines.star_evidence import run_star_evidence
from app.engines.system_design import run_system_design

router = APIRouter(prefix="/v1", tags=["process"])
log = get_logger("routes.process")


def _dispatch(
    operation: ProcessOperation,
    payload: dict[str, Any],
    *,
    operation_id: str,
    correlation_id: str,
) -> dict[str, Any]:
    kwargs = {
        "payload": payload,
        "operation_id": operation_id,
        "correlation_id": correlation_id,
    }
    match operation:
        case ProcessOperation.DOCUMENT_EXTRACT:
            return run_document_extract(**kwargs)
        case ProcessOperation.DOCUMENT_CLASSIFY:
            return run_document_classify(**kwargs)
        case ProcessOperation.STAR_EVIDENCE:
            return run_star_evidence(**kwargs)
        case ProcessOperation.SYSTEM_DESIGN:
            return run_system_design(**kwargs)
        case ProcessOperation.PRACTICE_COACH:
            return run_practice_coach(**kwargs)
        case ProcessOperation.COMPANY_NORMALIZE:
            return run_company_normalize(**kwargs)
        case ProcessOperation.MOCK_QUESTION_VALIDATE:
            return run_mock_question_validate(**kwargs)
        case ProcessOperation.SPEECH_PROCESS:
            return run_speech_process(**kwargs)
    raise EngineError("UNSUPPORTED_OPERATION", retryable=False)


@router.post(
    "/process",
    response_model=ProcessSuccessResponse | ProcessFailureResponse,
    status_code=status.HTTP_200_OK,
)
async def process_operation(
    body: ProcessRequest,
    request: InternalRequest = Depends(require_internal_auth),
) -> ProcessSuccessResponse | ProcessFailureResponse:
    correlation_id = body.correlation_id or request.request_id
    log.info(
        "process_received",
        operation=body.operation.value,
        operation_id=body.operation_id,
        correlation_id=correlation_id,
    )

    try:
        data = _dispatch(
            body.operation,
            body.payload,
            operation_id=body.operation_id,
            correlation_id=correlation_id,
        )
    except EngineError as exc:
        log.warning(
            "process_failed",
            operation=body.operation.value,
            operation_id=body.operation_id,
            correlation_id=correlation_id,
            code=exc.code,
            retryable=exc.retryable,
        )
        return ProcessFailureResponse(
            success=False,
            code=exc.code,
            retryable=exc.retryable,
            operation_id=body.operation_id,
            correlation_id=correlation_id,
        )
    except Exception as exc:  # noqa: BLE001 - surface as structured failure
        log.exception(
            "process_error",
            operation=body.operation.value,
            operation_id=body.operation_id,
            correlation_id=correlation_id,
        )
        return ProcessFailureResponse(
            success=False,
            code="INTERNAL_PROCESSING_ERROR",
            retryable=True,
            operation_id=body.operation_id,
            correlation_id=correlation_id,
        )

    log.info(
        "process_completed",
        operation=body.operation.value,
        operation_id=body.operation_id,
        correlation_id=correlation_id,
    )
    return ProcessSuccessResponse(
        operation_id=body.operation_id,
        correlation_id=correlation_id,
        data=data,
    )
