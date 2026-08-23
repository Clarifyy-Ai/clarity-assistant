"""STAR evidence extraction and input-based draft validation."""

from __future__ import annotations

import re
from typing import Any

from app.core.logger import get_logger
from app.engines.schemas import EngineError

log = get_logger("engines.star_evidence")

_CLAIM_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")
_PLACEHOLDER_PATTERNS = (
    re.compile(r"\b\d+%\b"),
    re.compile(r"\$\s?\d"),
    re.compile(r"\b\d+\+?\s*(people|engineers|members|employees)\b", re.I),
    re.compile(r"\b(revenue|budget|cost\s+savings)\b", re.I),
)


def _sentences(value: str | None) -> list[str]:
    if not value or not str(value).strip():
        return []
    parts = _CLAIM_SPLIT.split(str(value).strip())
    return [part.strip() for part in parts if part.strip()]


def _extract_claims(field: str, text: str | None) -> list[dict[str, str]]:
    return [{"claim": sentence, "source": field} for sentence in _sentences(text)]


def _needs_placeholder(claim: str) -> bool:
    return any(pattern.search(claim) for pattern in _PLACEHOLDER_PATTERNS)


def run_star_evidence(payload: dict[str, Any], *, operation_id: str, correlation_id: str) -> dict[str, Any]:
    log.info("[STAR] evidence_extraction", operation_id=operation_id, correlation_id=correlation_id)

    situation = payload.get("situation")
    task = payload.get("task")
    action = payload.get("action")
    result = payload.get("result")
    resume_facts = payload.get("resume_facts") or {}
    jd_facts = payload.get("jd_facts") or {}

    if not any(isinstance(v, str) and v.strip() for v in (situation, task, action, result)):
        raise EngineError("STAR_INPUT_REQUIRED", retryable=False)

    claims: list[dict[str, str]] = []
    for field, value in (
        ("situation", situation),
        ("task", task),
        ("action", action),
        ("result", result),
    ):
        claims.extend(_extract_claims(field, value if isinstance(value, str) else None))

    supplemental: list[dict[str, str]] = []
    for source_label, facts in (("resume_facts", resume_facts), ("jd_facts", jd_facts)):
        if not isinstance(facts, dict):
            continue
        for key, value in facts.items():
            if isinstance(value, str) and value.strip():
                supplemental.append({"claim": value.strip(), "source": f"{source_label}.{key}"})
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, str) and item.strip():
                        supplemental.append({"claim": item.strip(), "source": f"{source_label}.{key}"})

    all_claims = claims + supplemental
    follow_up_questions: list[str] = []

    for field in ("situation", "task", "action", "result"):
        field_text = payload.get(field)
        if not isinstance(field_text, str) or not field_text.strip():
            follow_up_questions.append(f"Provide the {field} in your own words.")

    for claim in claims:
        if _needs_placeholder(claim["claim"]):
            follow_up_questions.append(
                f"Confirm metrics or employer details in: \"{claim['claim'][:120]}\""
            )

    draft = {
        "situation": situation if isinstance(situation, str) else "",
        "task": task if isinstance(task, str) else "",
        "action": action if isinstance(action, str) else "",
        "result": result if isinstance(result, str) else "",
        "draft_kind": "input_based",
        "verification": "input_based_draft",
    }

    log.info("[STAR] validation", operation_id=operation_id, correlation_id=correlation_id)
    missing_sources = [c for c in all_claims if not c.get("source")]
    if missing_sources:
        raise EngineError("CLAIM_SOURCE_REQUIRED", retryable=False)

    log.info("[STAR] completed", operation_id=operation_id, correlation_id=correlation_id)
    return {
        "claims": all_claims,
        "star_draft": draft,
        "follow_up_questions": follow_up_questions,
        "validation": {
            "all_claims_sourced": True,
            "claim_count": len(all_claims),
        },
    }
