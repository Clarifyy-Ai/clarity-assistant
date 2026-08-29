"""Pydantic request/response models for `/internal/gov-exams` endpoints."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class AvailabilityRequest(BaseModel):
    exam_id: str = Field(..., min_length=1, max_length=80)
    stage_id: str | None = Field(default=None, max_length=80)
    paper_id: str | None = Field(default=None, max_length=80)
    language: str = Field(default="en", max_length=8)
    question_count: int = Field(default=100, ge=1, le=500)
    topics: list[str] = Field(default_factory=list, max_length=40)
    difficulty: Literal["EASY", "MEDIUM", "HARD"] | None = None
    correlation_id: str | None = Field(default=None, max_length=128)
    job_id: str | None = Field(default=None, max_length=80)
    bank_type_keys: list[str] = Field(default_factory=list, max_length=40)


class AvailabilityResponse(BaseModel):
    requested: int
    available: int
    missing: int
    can_full_mock: bool
    can_custom_practice: bool
    custom_practice_max: int
    exam_type_keys: list[str] = Field(default_factory=list)
    section_coverage: dict[str, int] = Field(default_factory=dict)


class SelectRequest(BaseModel):
    exam_id: str = Field(..., min_length=1, max_length=80)
    stage_id: str | None = Field(default=None, max_length=80)
    language: str = Field(default="en", max_length=8)
    question_count: int = Field(default=100, ge=1, le=500)
    topics: list[str] = Field(default_factory=list, max_length=40)
    difficulty: Literal["EASY", "MEDIUM", "HARD"] | None = None
    seed: str | None = Field(default=None, max_length=120)
    correlation_id: str | None = Field(default=None, max_length=128)
    job_id: str | None = Field(default=None, max_length=80)
    exclude_ids: list[str] = Field(default_factory=list, max_length=500)
    mode: str = Field(default="generated_mock", max_length=40)


class SelectResponse(BaseModel):
    selected_ids: list[str]
    selected_count: int
    available_count: int
    requested: int
    seed: str
    exam_type_keys: list[str] = Field(default_factory=list)
    rejected_duplicates: int = 0
    section_counts: dict[str, int] = Field(default_factory=dict)


class QuestionPayload(BaseModel):
    question_text: str = Field(..., min_length=1)
    options: list[Any] = Field(default_factory=list)
    correct_answer: str | int | None = None
    correct_index: int | None = None
    explanation: str | None = None
    subject: str | None = None
    topic: str | None = None
    difficulty: str | None = None
    language: str | None = "en"
    source: str | None = None
    marks_positive: float | None = 1.0
    marks_negative: float | None = 0.0
    metadata: dict[str, Any] | None = None
    id: str | None = None


class ValidateQuestionsRequest(BaseModel):
    questions: list[QuestionPayload] = Field(..., min_length=1, max_length=500)
    correlation_id: str | None = Field(default=None, max_length=128)
    job_id: str | None = Field(default=None, max_length=80)
    language: str = Field(default="en", max_length=8)
    reject_near_duplicates: bool = True


class QuestionValidationResult(BaseModel):
    index: int
    accepted: bool
    reasons: list[str] = Field(default_factory=list)
    question_id: str | None = None


class ValidateQuestionsResponse(BaseModel):
    accepted: list[QuestionValidationResult]
    rejected: list[QuestionValidationResult]
    accepted_count: int
    rejected_count: int


class ProcessJobRequest(BaseModel):
    job_id: str = Field(..., min_length=1, max_length=80)
    correlation_id: str | None = Field(default=None, max_length=128)


class ProcessJobResponse(BaseModel):
    success: bool
    job_id: str
    status: str
    paper_id: str | None = None
    mock_test_id: str | None = None
    question_count: int | None = None
    bank_count: int | None = None
    ai_count: int | None = None
    deterministic_count: int | None = None
    source_mix: dict[str, int] | None = None
    paper_source: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    retryable: bool | None = None


class BuildPaperRequest(BaseModel):
    """Explicit paper-assembly request (alias surface for Edge → Python)."""

    job_id: str = Field(..., min_length=1, max_length=80)
    exam_id: str = Field(..., min_length=1, max_length=80)
    stage_id: str | None = Field(default=None, max_length=80)
    paper_id: str | None = Field(default=None, max_length=80)
    language: str = Field(default="en", max_length=8)
    mode: str = Field(default="generated_mock", max_length=40)
    blueprint: dict[str, Any] | None = None
    question_sources: list[str] = Field(default_factory=list, max_length=20)
    correlation_id: str | None = Field(default=None, max_length=128)


class BuildPaperResponse(BaseModel):
    success: bool
    job_id: str
    status: str
    selected_question_ids: list[str] = Field(default_factory=list)
    generated_question_ids: list[str] = Field(default_factory=list)
    source_distribution: dict[str, int] = Field(default_factory=dict)
    validation_status: str = "pending"
    missing_slots: int = 0
    paper_id: str | None = None
    mock_test_id: str | None = None
    question_count: int | None = None
    paper_structure: dict[str, Any] | None = None
    error_code: str | None = None
    error_message: str | None = None
    retryable: bool | None = None
