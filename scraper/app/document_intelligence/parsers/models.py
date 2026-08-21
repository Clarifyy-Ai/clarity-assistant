from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ParseWarning(BaseModel):
    code: str
    message: str
    pages: list[int] = Field(default_factory=list)


class PageResult(BaseModel):
    page_number: int
    text: str
    extraction_method: Literal["text", "ocr", "none"]
    ocr_confidence: float | None = None
    low_confidence_regions: list[dict[str, Any]] = Field(default_factory=list)
    image_references: list[str] = Field(default_factory=list)
    table_references: list[str] = Field(default_factory=list)


class ParsedDocument(BaseModel):
    parser_version: str
    filename: str
    media_type: str
    pages: list[PageResult] = Field(default_factory=list)
    text: str
    warnings: list[ParseWarning] = Field(default_factory=list)
    confidence: float
    review_required: bool


class ExperienceEntry(BaseModel):
    text: str
    source_pages: list[int] = Field(default_factory=list)


class ResumeResult(BaseModel):
    name: str | None = None
    contact_details: dict[str, str] = Field(default_factory=dict)
    summary: str | None = None
    skills: list[str] = Field(default_factory=list)
    experience: list[ExperienceEntry] = Field(default_factory=list)
    projects: list[ExperienceEntry] = Field(default_factory=list)
    education: list[ExperienceEntry] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    achievements: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    role_keywords: list[str] = Field(default_factory=list)
    warnings: list[ParseWarning] = Field(default_factory=list)
    confidence: float
    source_pages: list[int] = Field(default_factory=list)


class JobDescriptionResult(BaseModel):
    job_title: str | None = None
    company: str | None = None
    seniority: str | None = None
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)
    qualifications: list[str] = Field(default_factory=list)
    experience: list[str] = Field(default_factory=list)
    education: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    interview_competencies: list[str] = Field(default_factory=list)
    location: str | None = None
    employment_type: str | None = None
    confidence: float
    warnings: list[ParseWarning] = Field(default_factory=list)
    source_pages: list[int] = Field(default_factory=list)
