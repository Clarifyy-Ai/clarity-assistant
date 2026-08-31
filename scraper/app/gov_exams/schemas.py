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
    mode: str = Field(default="generated_mock", max_length=40)


class AvailabilityResponse(BaseModel):
    requested: int
    eligible: int = 0
    available: int
    missing: int
    can_full_mock: bool
    can_custom_practice: bool
    custom_practice_max: int
    exam_type_keys: list[str] = Field(default_factory=list)
    section_coverage: dict[str, int] = Field(default_factory=dict)
    language_available: bool = True
    blocked_reason: str | None = None
    mode: str = "generated_mock"


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
    accepted: bool = False
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
    sections: list[Any] | None = None
    marks: float | None = None
    negative_marking: float | None = None
    duration: int | None = None
    language: str | None = None
    blueprint_version: str | None = None
    source_summary: dict[str, int] | None = None
    validation_result: str | None = None


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
    sections: list[Any] | None = None
    marks: float | None = None
    negative_marking: float | None = None
    duration: int | None = None
    language: str | None = None
    blueprint_version: str | None = None
    source_summary: dict[str, int] | None = None
    validation_result: str | None = None


def fields_from_job_row(job: dict[str, Any]) -> dict[str, Any]:
    """Exam-structure fields persisted on a completed generation job."""
    bp = job.get("blueprint_json") if isinstance(job.get("blueprint_json"), dict) else {}
    mix = job.get("source_mix") if isinstance(job.get("source_mix"), dict) else {}
    return {
        "question_count": bp.get("total_questions"),
        "sections": bp.get("sections"),
        "marks": bp.get("total_marks"),
        "negative_marking": bp.get("negative_mark"),
        "duration": bp.get("duration_minutes"),
        "language": bp.get("language") or job.get("language"),
        "blueprint_version": bp.get("algorithm_version")
        or bp.get("generation_policy_version")
        or bp.get("paper_blueprint_version"),
        "source_mix": mix or None,
        "source_summary": mix or None,
        "validation_result": "passed" if str(job.get("status") or "") == "completed" else None,
        "paper_source": bp.get("paper_class"),
    }


def paper_mix_from_result(result: ProcessJobResponse) -> dict[str, int]:
    """Prefer granular engine mix; never collapse official/verified into approved_bank."""
    granular = result.source_mix or result.source_summary or {}
    if isinstance(granular, dict) and granular:
        out: dict[str, int] = {}
        for key, value in granular.items():
            try:
                count = int(value)
            except (TypeError, ValueError):
                continue
            if count:
                out[str(key)] = count
        if out:
            return out
    return {
        k: v
        for k, v in {
            "approved_bank": result.bank_count or 0,
            "ai_generated_practice": result.ai_count or 0,
            "generated_practice": result.deterministic_count or 0,
        }.items()
        if v
    }


def paper_mix_from_result(result: ProcessJobResponse) -> dict[str, int]:
    """Prefer granular engine mix; never collapse official/verified into approved_bank."""
    granular = result.source_mix or result.source_summary or {}
    if isinstance(granular, dict) and granular:
        out: dict[str, int] = {}
        for key, value in granular.items():
            try:
                count = int(value)
            except (TypeError, ValueError):
                continue
            if count > 0:
                out[str(key)] = count
        if out:
            return out
    return {
        k: v
        for k, v in {
            "approved_bank": result.bank_count or 0,
            "ai_generated_practice": result.ai_count or 0,
            "generated_practice": result.deterministic_count or 0,
        }.items()
        if v
    }
