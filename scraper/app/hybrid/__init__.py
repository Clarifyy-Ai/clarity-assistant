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
    "practice_coach",
    "document_extract",
    "gap_analysis",
    "session_debrief",
    "session_scorecard",
    "analyze_test",
    "speech_process",
    "prep_rephrase",
    "prep_coding",
    "prep_project",
    "prep_answer_outline",
    "prep_raw_prompt",
    "ping",
)

__all__ = ["SERVICE_VERSION", "SUPPORTED_OPERATIONS"]
