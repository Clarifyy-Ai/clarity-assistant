"""Pydantic schemas used by the FastAPI layer and the scraper pipeline."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class StartScrapeRequest(BaseModel):
    exam_type: str = Field(..., min_length=2, max_length=64)
    year_from: int | None = Field(default=None, ge=1990, le=2100)
    year_to: int | None = Field(default=None, ge=1990, le=2100)
    source_overrides: dict[str, Any] | None = None


class JobProgress(BaseModel):
    total_papers: int = 0
    processed_papers: int = 0
    extracted_questions: int = 0
    saved_images: int = 0
    failed_papers: int = 0


class JobState(BaseModel):
    job_id: str
    exam_type: str
    status: JobStatus
    progress: JobProgress = JobProgress()
    logs: list[str] = []
    error: str | None = None
    created_at: datetime
    updated_at: datetime


class StartScrapeResponse(BaseModel):
    job_id: str
    status: Literal["queued"]


class PaperCandidate(BaseModel):
    exam_type: str
    exam_name: str
    year: int
    source_url: HttpUrl
    paper_code: str | None = None
    session: str | None = None
    shift: str | None = None
    answer_key_url: str | None = None  # NEW: linked official answer-key PDF


class ParsedQuestion(BaseModel):
    question_text: str
    options: list[dict[str, str]]
    correct_answer: Literal["A", "B", "C", "D"] | None = None  # None = answer unknown
    explanation: str = ""
    subject: str = "General"
    topic: str = "PYQ"
    difficulty: Literal["EASY", "MEDIUM", "HARD"] = "MEDIUM"
    image_url: str | None = None
    latex_present: bool = False


class ParsedImage(BaseModel):
    data: bytes
    ext: Literal["png", "jpg", "jpeg", "webp"] = "png"
    alt_text: str | None = None
    question_index: int | None = None


class ParsedPaper(BaseModel):
    candidate: PaperCandidate
    pdf_bytes: bytes | None = None
    questions: list[ParsedQuestion]
    images: list[ParsedImage] = []
    file_hash: str
    answers_partial: bool = False  # True if answer-key extraction was incomplete
