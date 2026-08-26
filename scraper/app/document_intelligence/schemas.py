from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl, model_validator


class DocumentCategory(str, Enum):
    RESUME_PDF = "resume_pdf"
    SCANNED_PDF = "scanned_pdf"
    DOC = "doc"
    DOCX = "docx"
    TXT = "txt"
    JOB_DESCRIPTION = "job_description"
    XLSX = "xlsx"
    CSV = "csv"
    EXAM = "exam"
    HTML = "html"
    IMAGE = "image"


class StorageReference(BaseModel):
    bucket: str = Field(..., min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._-]+$")
    path: str = Field(..., min_length=1, max_length=1024)
    signed_url: HttpUrl | None = None
    expires_at: datetime | None = None

    @model_validator(mode="after")
    def validate_reference(self) -> "StorageReference":
        if self.signed_url and self.signed_url.scheme != "https":
            raise ValueError("signed_url must use HTTPS")
        if self.path.startswith("/") or ".." in self.path.split("/"):
            raise ValueError("storage path is invalid")
        return self


class DocumentJobRequest(BaseModel):
    document_id: str = Field(..., min_length=1, max_length=128)
    owner_id: str = Field(..., min_length=1, max_length=128)
    category: DocumentCategory
    storage: StorageReference
    content_hash: str | None = Field(default=None, min_length=32, max_length=128, pattern=r"^[0-9a-fA-F]+$")
    parser_version: str = Field("1", min_length=1, max_length=32)


class DurableDocumentJobNotifyRequest(BaseModel):
    """Edge dispatch envelope for an already-persisted document_processing_jobs row."""

    job_id: str = Field(..., min_length=36, max_length=36)
    document_id: str = Field(..., min_length=1, max_length=128)
    owner_id: str = Field(..., min_length=1, max_length=128)
    operation: str = Field(default="parse", min_length=1, max_length=64)
    correlation_id: str | None = Field(default=None, min_length=8, max_length=128)
    storage_reference: dict[str, Any] = Field(default_factory=dict)


class ExamSourceJobRequest(BaseModel):
    source_id: str = Field(..., min_length=1, max_length=128)
    exam_type: str = Field(..., min_length=2, max_length=64)
    storage: StorageReference
    source_hash: str | None = Field(default=None, min_length=32, max_length=128, pattern=r"^[0-9a-fA-F]+$")


class ValidatePaperJobRequest(BaseModel):
    paper_id: str = Field(..., min_length=1, max_length=128)
    storage: StorageReference
    expected_category: Literal["exam", "practice_paper"] = "exam"


class JobState(str, Enum):
    QUEUED = "queued"
    LEASED = "leased"
    DOWNLOADING = "downloading"
    EXTRACTING = "extracting"
    OCR = "OCR"
    SEGMENTING = "segmenting"
    VALIDATING = "validating"
    AWAITING_REVIEW = "awaiting_review"
    COMPLETED = "completed"
    FAILED_RETRYABLE = "failed_retryable"
    FAILED_PERMANENT = "failed_permanent"
    CANCELLED = "cancelled"


DOCUMENT_TERMINAL_STATES = frozenset({
    JobState.COMPLETED,
    JobState.FAILED_PERMANENT,
    JobState.CANCELLED,
})


class JobError(BaseModel):
    code: str
    message: str
    retryable: bool
    stage: str
    correlation_id: str


class JobResponse(BaseModel):
    success: bool
    job_id: str
    state: JobState
    result_reference: str | None = None
    warnings: list[Any] = Field(default_factory=list)
    correlation_id: str
    error: JobError | None = None
    attempt_count: int = 0
    max_attempts: int = 3
    created_at: datetime
    updated_at: datetime


class JobRecord(JobResponse):
    operation: str
    owner_id: str | None = None
    worker_id: str | None = None
    lease_expires_at: datetime | None = None
