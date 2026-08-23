"""Mock interview question validation and bank selection."""

from __future__ import annotations

from typing import Any

from app.core.logger import get_logger
from app.document_intelligence.deduplication import compute_normalized_hash
from app.document_intelligence.question_validators import validate_question_integrity
from app.engines.schemas import EngineError

log = get_logger("engines.mock_question_validate")


def _question_text(q: dict[str, Any]) -> str:
    return str(q.get("question_text") or q.get("text") or q.get("prompt") or "").strip()


def _question_options(q: dict[str, Any]) -> list[str]:
    raw = q.get("options")
    if not isinstance(raw, list):
        return []
    result: list[str] = []
    for opt in raw:
        if isinstance(opt, dict):
            result.append(str(opt.get("text") or "").strip())
        else:
            result.append(str(opt).strip())
    return [opt for opt in result if opt]


def _dedupe_questions(questions: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    unique: list[dict[str, Any]] = []
    warnings: list[str] = []
    seen_hashes: set[str] = set()

    for idx, question in enumerate(questions):
        text = _question_text(question)
        options = _question_options(question)
        digest = compute_normalized_hash(text, options)
        if digest in seen_hashes:
            warnings.append(f"duplicate_removed:index_{idx}")
            continue
        seen_hashes.add(digest)
        unique.append(question)
    return unique, warnings


def _score_quality(question: dict[str, Any]) -> dict[str, Any]:
    integrity = validate_question_integrity(question)
    text = _question_text(question)
    score = 0.0
    if integrity["is_valid"]:
        score += 0.6
    if len(text) >= 20:
        score += 0.2
    if _question_options(question):
        score += 0.1
    if question.get("source") or question.get("source_id"):
        score += 0.1
    return {
        "quality_score": round(min(score, 1.0), 3),
        "integrity": integrity,
    }


def _select_from_bank(
    bank_candidates: list[dict[str, Any]],
    *,
    selection_criteria: dict[str, Any] | None,
    existing_questions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not bank_candidates:
        raise EngineError("NO_SAFE_FALLBACK", retryable=False)

    count = 1
    if isinstance(selection_criteria, dict):
        raw_count = selection_criteria.get("count") or selection_criteria.get("limit")
        try:
            count = max(1, int(raw_count))
        except (TypeError, ValueError):
            count = 1

    exclude_hashes = {
        compute_normalized_hash(_question_text(q), _question_options(q))
        for q in existing_questions
    }

    scored: list[tuple[float, dict[str, Any]]] = []
    for candidate in bank_candidates:
        text = _question_text(candidate)
        options = _question_options(candidate)
        digest = compute_normalized_hash(text, options)
        if digest in exclude_hashes:
            continue
        quality = _score_quality(candidate)
        if not quality["integrity"]["is_valid"]:
            continue
        scored.append((quality["quality_score"], candidate))

    scored.sort(key=lambda item: item[0], reverse=True)
    selected = [item[1] for item in scored[:count]]
    if not selected:
        raise EngineError("NO_SAFE_FALLBACK", retryable=False)
    return selected


def run_mock_question_validate(
    payload: dict[str, Any],
    *,
    operation_id: str,
    correlation_id: str,
) -> dict[str, Any]:
    log.info(
        "[MOCK_QUESTION] validate",
        operation_id=operation_id,
        correlation_id=correlation_id,
    )

    raw_questions = payload.get("questions")
    questions: list[dict[str, Any]] = []
    if isinstance(raw_questions, list):
        questions = [q for q in raw_questions if isinstance(q, dict)]

    bank_candidates = payload.get("bank_candidates")
    bank: list[dict[str, Any]] = []
    if isinstance(bank_candidates, list):
        bank = [q for q in bank_candidates if isinstance(q, dict)]

    selection_criteria = payload.get("selection_criteria")
    criteria = selection_criteria if isinstance(selection_criteria, dict) else None

    if not questions and not bank:
        raise EngineError("NO_SAFE_FALLBACK", retryable=False)

    deduped, dedupe_warnings = _dedupe_questions(questions)
    validations = [
        {"index": idx, "question_text": _question_text(q), **_score_quality(q)}
        for idx, q in enumerate(deduped)
    ]

    selected_from_bank: list[dict[str, Any]] = []
    if criteria or (not deduped and bank):
        selected_from_bank = _select_from_bank(
            bank,
            selection_criteria=criteria,
            existing_questions=deduped,
        )

    log.info(
        "[MOCK_QUESTION] completed",
        operation_id=operation_id,
        correlation_id=correlation_id,
        validated=len(validations),
        selected=len(selected_from_bank),
    )
    return {
        "validated_questions": deduped,
        "validations": validations,
        "dedupe_warnings": dedupe_warnings,
        "selected_from_bank": selected_from_bank,
    }
