"""Capability metadata for hybrid operations (logging / routing hints)."""

from __future__ import annotations

from typing import Any

from app.hybrid import SUPPORTED_OPERATIONS

# Deterministic capability profiles — no external AI, pure Python handlers.
_CAPABILITIES: dict[str, dict[str, Any]] = {
    "star_format": {
        "engine": "python_template",
        "requires_ai": False,
        "category": "prep",
        "inputs": ["situation", "task", "action", "result", "questionText", "resume_snippets"],
    },
    "system_design_outline": {
        "engine": "python_template",
        "requires_ai": False,
        "category": "prep",
        "inputs": ["prompt", "system_name", "name"],
    },
    "resume_structure": {
        "engine": "document_parser",
        "requires_ai": False,
        "category": "documents",
        "inputs": ["text"],
    },
    "company_research_skeleton": {
        "engine": "python_template",
        "requires_ai": False,
        "category": "research",
        "inputs": ["company", "company_name", "name"],
    },
    "mock_question_bank": {
        "engine": "curated_bank",
        "requires_ai": False,
        "category": "mock",
        "inputs": ["type", "difficulty", "count"],
    },
    "practice_coach_hint": {
        "engine": "python_scaffold",
        "requires_ai": False,
        "category": "coach",
        "inputs": ["questionText", "transcript"],
    },
    "document_extract": {
        "engine": "document_parser",
        "requires_ai": False,
        "category": "documents",
        "inputs": ["text", "category"],
    },
    "ping": {
        "engine": "identity",
        "requires_ai": False,
        "category": "health",
        "inputs": [],
    },
}


def decide_capabilities(operation_type: str) -> dict[str, Any]:
    """Return logging metadata for an operation type."""
    key = (operation_type or "").strip().lower()
    base = _CAPABILITIES.get(key)
    if base is None:
        return {
            "operation_type": key or operation_type,
            "supported": False,
            "engine": None,
            "requires_ai": False,
            "category": "unknown",
        }
    return {
        "operation_type": key,
        "supported": key in SUPPORTED_OPERATIONS,
        **base,
    }
