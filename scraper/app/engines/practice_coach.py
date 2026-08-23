"""Structured practice coaching without fabricated answers."""

from __future__ import annotations

import re
from typing import Any

from app.core.logger import get_logger
from app.engines.schemas import EngineError

log = get_logger("engines.practice_coach")

_VALID_HELP_TYPES = frozenset({"hint", "structure", "checklist", "star", "concepts", "followups"})


def _keywords(text: str, limit: int = 8) -> list[str]:
    tokens = re.findall(r"[a-zA-Z]{4,}", text.lower())
    seen: set[str] = set()
    result: list[str] = []
    for token in tokens:
        if token in seen:
            continue
        seen.add(token)
        result.append(token)
        if len(result) >= limit:
            break
    return result


def run_practice_coach(payload: dict[str, Any], *, operation_id: str, correlation_id: str) -> dict[str, Any]:
    question = payload.get("question")
    if not isinstance(question, str) or not question.strip():
        raise EngineError("QUESTION_REQUIRED", retryable=False)

    help_type = str(payload.get("help_type") or "hint").casefold()
    if help_type not in _VALID_HELP_TYPES:
        raise EngineError("INVALID_HELP_TYPE", retryable=False)

    user_answer = payload.get("user_answer")
    answer_text = user_answer.strip() if isinstance(user_answer, str) else ""
    keywords = _keywords(question)

    log.info(
        "[PRACTICE_COACH] building",
        operation_id=operation_id,
        correlation_id=correlation_id,
        help_type=help_type,
    )

    base = {
        "source": "python_structured",
        "help_type": help_type,
        "question": question.strip(),
        "has_user_answer": bool(answer_text),
    }

    if help_type == "hint":
        if not keywords:
            raise EngineError("INSUFFICIENT_INPUT", retryable=False)
        base["hint"] = (
            "Focus your answer on the themes present in the question: "
            + ", ".join(keywords[:5])
            + ". Use concrete examples from your own experience only."
        )
    elif help_type == "structure":
        base["answer_structure"] = [
            "Opening: restate the question in your own words",
            "Context: one sentence of background from your experience",
            "Core answer: 2-4 points tied to the question",
            "Close: brief takeaway or lesson learned",
        ]
    elif help_type == "checklist":
        base["checklist"] = [
            "Did you directly address every part of the question?",
            "Did you use only facts you can support from your input?",
            "Is there a clear beginning, middle, and end?",
            "Did you avoid unsupported metrics or employer names?",
        ]
    elif help_type == "star":
        base["star_structure"] = {
            "situation": "Describe the context using only provided details",
            "task": "State your responsibility without inventing a title",
            "action": "List steps you actually took",
            "result": "Share outcomes you can substantiate; use placeholders otherwise",
        }
    elif help_type == "concepts":
        base["key_concepts"] = keywords or ["general interview communication"]
    elif help_type == "followups":
        base["followups"] = [
            f"What experience do you have related to '{keywords[0]}'?" if keywords else "What example best illustrates your approach?",
            "What tradeoffs did you consider?",
            "What would you do differently next time?",
        ]

    if help_type != "hint" and not keywords and help_type in {"concepts", "followups"}:
        raise EngineError("INSUFFICIENT_INPUT", retryable=False)

    log.info("[PRACTICE_COACH] completed", operation_id=operation_id, correlation_id=correlation_id)
    return base
