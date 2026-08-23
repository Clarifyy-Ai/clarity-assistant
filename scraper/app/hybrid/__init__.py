"""Deterministic hybrid operations executed on the Python scraper service."""

from __future__ import annotations

SERVICE_VERSION = "1.1.0"

SUPPORTED_OPERATIONS: tuple[str, ...] = (
    "star_format",
    "system_design_outline",
    "resume_structure",
    "company_research_skeleton",
    "mock_question_bank",
    "practice_coach_hint",
    "document_extract",
    "ping",
)

__all__ = ["SERVICE_VERSION", "SUPPORTED_OPERATIONS"]
