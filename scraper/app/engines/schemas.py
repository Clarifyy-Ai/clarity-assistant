"""Pydantic models for the unified /v1/process contract."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class ProcessOperation(str, Enum):
    DOCUMENT_EXTRACT = "document_extract"
    DOCUMENT_CLASSIFY = "document_classify"
    STAR_EVIDENCE = "star_evidence"
    SYSTEM_DESIGN = "system_design"
    PRACTICE_COACH = "practice_coach"
    COMPANY_NORMALIZE = "company_normalize"
    MOCK_QUESTION_VALIDATE = "mock_question_validate"
    SPEECH_PROCESS = "speech_process"


class ProcessRequest(BaseModel):
    operation: ProcessOperation
    operation_id: str = Field(..., min_length=1, max_length=128)
    correlation_id: str = Field(..., min_length=1, max_length=128)
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime | None = None


class ProcessSuccessResponse(BaseModel):
    success: Literal[True] = True
    operation_id: str
    correlation_id: str
    source: Literal["python"] = "python"
    data: dict[str, Any]


class ProcessFailureResponse(BaseModel):
    success: Literal[False] = False
    code: str
    retryable: bool
    operation_id: str
    correlation_id: str


class EngineError(Exception):
    """Structured engine failure mapped to ProcessFailureResponse."""

    def __init__(self, code: str, *, retryable: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable
