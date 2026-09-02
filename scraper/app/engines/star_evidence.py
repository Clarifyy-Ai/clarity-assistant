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

_INTERVIEW_QUESTION_RE = re.compile(
    r"Interview question:\s*([\s\S]*?)(?=\n\nCategory:|\n\nUser draft|\n\nImprove|\Z)",
    re.I,
)
_CATEGORY_RE = re.compile(r"Category:\s*(.+)", re.I)
_USER_DRAFT_RE = re.compile(
    r"User draft \(optional\):\s*([\s\S]*?)(?=\n\nImprove|\n\nWrite|\Z)",
    re.I,
)
_STAR_SECTION_RE = re.compile(
    r"(Situation|Task|Action|Result)\s*:\s*",
    re.I,
)
_EMPTY_DRAFTS = frozenset({"(none yet)", "none", "(none)", ""})


def _str_field(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    return value.strip() if isinstance(value, str) else ""


def _parse_star_labeled_sections(text: str) -> dict[str, str]:
    """Parse Situation:/Task:/Action:/Result: blocks from freeform text."""
    if not _STAR_SECTION_RE.search(text):
        return {"situation": "", "task": "", "action": "", "result": ""}

    sections: dict[str, str] = {}
    matches = list(_STAR_SECTION_RE.finditer(text))
    for index, match in enumerate(matches):
        label = match.group(1).lower()
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        sections[label] = text[start:end].strip()

    return {
        "situation": sections.get("situation", ""),
        "task": sections.get("task", ""),
        "action": sections.get("action", ""),
        "result": sections.get("result", ""),
    }


def _looks_like_answer_bank_prompt(text: str) -> bool:
    lowered = text.lower()
    return "interview question:" in lowered and (
        "category:" in lowered or "user draft" in lowered
    )


def _parse_answer_bank_prompt(text: str) -> dict[str, str]:
    """
    Map Answer Bank / prep-tool star_method prompts into STAR fields.

    Expected shape (from AnswerBank.tsx):
      Interview question: ...
      Category: Behavioural
      User draft (optional): ...
    """
    question = ""
    category = ""
    draft = ""

    question_match = _INTERVIEW_QUESTION_RE.search(text)
    if question_match:
        question = question_match.group(1).strip()

    category_match = _CATEGORY_RE.search(text)
    if category_match:
        category = category_match.group(1).strip()

    draft_match = _USER_DRAFT_RE.search(text)
    if draft_match:
        draft = draft_match.group(1).strip()
        if draft.lower() in _EMPTY_DRAFTS:
            draft = ""

    if draft:
        labeled = _parse_star_labeled_sections(draft)
        if any(labeled.values()):
            return labeled

    task = question or "[NEEDS EVIDENCE — restate the interview question as your goal]"
    if category and question:
        situation = f"[NEEDS EVIDENCE — context for a {category} answer]"
    elif category:
        situation = f"[NEEDS EVIDENCE — context for a {category} answer]"
    else:
        situation = "[NEEDS EVIDENCE — describe the situation]"

    if draft:
        action = draft
    else:
        action = "[NEEDS EVIDENCE — describe the actions you took]"

    return {
        "situation": situation[:2000],
        "task": task[:2000],
        "action": action[:2000],
        "result": "[Add measurable result if available]",
    }


def _normalize_star_fields(payload: dict[str, Any]) -> dict[str, str]:
    """Resolve STAR fields from explicit sections or Answer Bank prompt blobs."""
    situation = _str_field(payload, "situation")
    task = _str_field(payload, "task")
    action = _str_field(payload, "action")
    result = _str_field(payload, "result")
    raw_input = _str_field(payload, "input")

    candidate_blob = raw_input or action
    if candidate_blob and _looks_like_answer_bank_prompt(candidate_blob):
        return _parse_answer_bank_prompt(candidate_blob)

    if any((situation, task, action, result)):
        return {
            "situation": situation,
            "task": task,
            "action": action,
            "result": result,
        }

    if raw_input:
        labeled = _parse_star_labeled_sections(raw_input)
        if any(labeled.values()):
            return labeled

    if action:
        labeled = _parse_star_labeled_sections(action)
        if any(labeled.values()):
            return labeled

    return {
        "situation": situation,
        "task": task,
        "action": action,
        "result": result,
    }


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

    normalized = _normalize_star_fields(payload)
    situation = normalized["situation"]
    task = normalized["task"]
    action = normalized["action"]
    result = normalized["result"]

    resume_facts = payload.get("resume_facts") or {}
    jd_facts = payload.get("jd_facts") or {}

    if not any((situation, task, action, result)):
        raise EngineError("STAR_INPUT_REQUIRED", retryable=False)

    claims: list[dict[str, str]] = []
    for field, value in (
        ("situation", situation),
        ("task", task),
        ("action", action),
        ("result", result),
    ):
        claims.extend(_extract_claims(field, value))

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

    for field, field_text in (
        ("situation", situation),
        ("task", task),
        ("action", action),
        ("result", result),
    ):
        if not field_text.strip() or field_text.strip().startswith("[NEEDS EVIDENCE"):
            follow_up_questions.append(f"Provide the {field} in your own words.")

    for claim in claims:
        if _needs_placeholder(claim["claim"]):
            follow_up_questions.append(
                f"Confirm metrics or employer details in: \"{claim['claim'][:120]}\""
            )

    draft = {
        "situation": situation,
        "task": task,
        "action": action,
        "result": result,
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
