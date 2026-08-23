"""Structured practice coaching without fabricated answers.

Canonical payload field: operation_type
  hint | answer | coach_chat | structure | checklist | star | concepts | followups

Success data always includes:
  operation_type, reply, source=python
  hints (list of 3 strings) when operation_type == hint
"""

from __future__ import annotations

import re
from typing import Any

from app.core.logger import get_logger
from app.engines.schemas import EngineError

log = get_logger("engines.practice_coach")

_VALID_OPS = frozenset(
    {
        "hint",
        "answer",
        "coach_chat",
        "structure",
        "checklist",
        "star",
        "concepts",
        "followups",
    }
)

_LEGACY_MODE_MAP = {
    "hint": "hint",
    "chat": "coach_chat",
    "coach_chat": "coach_chat",
    "answer": "answer",
    "full_answer": "answer",
    "structure": "structure",
    "checklist": "checklist",
    "star": "star",
    "concepts": "concepts",
    "followups": "followups",
}


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


def _str(payload: dict[str, Any], *keys: str, default: str = "") -> str:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return default


def _resolve_operation_type(payload: dict[str, Any]) -> str:
    raw = payload.get("operation_type")
    if isinstance(raw, str) and raw.strip():
        op = raw.strip().casefold()
        if op in _VALID_OPS:
            return op
        raise EngineError("INVALID_OPERATION_TYPE", retryable=False)

    # Legacy adapters — map into operation_type then stop supporting dual schemas at callers.
    for key in ("help_type", "mode"):
        legacy = payload.get(key)
        if isinstance(legacy, str) and legacy.strip():
            mapped = _LEGACY_MODE_MAP.get(legacy.strip().casefold())
            if mapped:
                return mapped
            raise EngineError("INVALID_OPERATION_TYPE", retryable=False)

    return "hint"


def _envelope(operation_type: str, reply: str, **extra: Any) -> dict[str, Any]:
    out: dict[str, Any] = {
        "operation_type": operation_type,
        "reply": reply.strip(),
        "source": "python",
    }
    out.update(extra)
    return out


def run_practice_coach(
    payload: dict[str, Any],
    *,
    operation_id: str,
    correlation_id: str,
) -> dict[str, Any]:
    operation_type = _resolve_operation_type(payload)

    question = _str(payload, "question", "current_question")
    message = _str(payload, "message", "user_message")
    transcript = _str(payload, "transcript", "recent_transcript", "user_answer")
    resume_context = _str(payload, "resume_context")
    interview_type = _str(payload, "interview_type", default="behavioral")

    if operation_type in {"hint", "structure", "checklist", "star", "concepts", "followups", "answer"}:
        if not question:
            raise EngineError("QUESTION_REQUIRED", retryable=False)

    if operation_type == "coach_chat" and not (message or question):
        raise EngineError("MESSAGE_REQUIRED", retryable=False)

    keywords = _keywords(question or message)
    log.info(
        "[PRACTICE_COACH] building",
        operation_id=operation_id,
        correlation_id=correlation_id,
        operation_type=operation_type,
    )

    if operation_type == "hint":
        if not keywords:
            raise EngineError("INSUFFICIENT_INPUT", retryable=False)
        themes = ", ".join(keywords[:5])
        hints = [
            f"Anchor on themes: {themes}.",
            "Use one concrete example from your own experience only.",
            "Close with a result you can substantiate — never invent metrics.",
        ]
        reply = "\n".join(f"• {h}" for h in hints)
        result = _envelope(operation_type, reply, hints=hints, question=question)
        log.info("[PRACTICE_COACH] completed", operation_id=operation_id, correlation_id=correlation_id)
        return result

    if operation_type == "structure":
        steps = [
            "Opening: restate the question in your own words",
            "Context: one sentence of background from your experience",
            "Core answer: 2–4 points tied to the question",
            "Close: brief takeaway or lesson learned",
        ]
        reply = "Suggested structure:\n" + "\n".join(f"{i}. {s}" for i, s in enumerate(steps, 1))
        return _envelope(operation_type, reply, answer_structure=steps, question=question)

    if operation_type == "checklist":
        items = [
            "Did you directly address every part of the question?",
            "Did you use only facts you can support from your input?",
            "Is there a clear beginning, middle, and end?",
            "Did you avoid unsupported metrics or employer names?",
        ]
        reply = "Quick checklist:\n" + "\n".join(f"☐ {i}" for i in items)
        return _envelope(operation_type, reply, checklist=items, question=question)

    if operation_type == "star":
        star = {
            "situation": "Describe the context using only provided details",
            "task": "State your responsibility without inventing a title",
            "action": "List steps you actually took",
            "result": "Share outcomes you can substantiate; use placeholders otherwise",
        }
        reply = (
            "STAR coach guide:\n"
            f"Situation — {star['situation']}\n"
            f"Task — {star['task']}\n"
            f"Action — {star['action']}\n"
            f"Result — {star['result']}"
        )
        return _envelope(operation_type, reply, star_structure=star, question=question)

    if operation_type == "concepts":
        concepts = keywords or ["general interview communication"]
        reply = "Key concepts to cover: " + ", ".join(concepts)
        return _envelope(operation_type, reply, key_concepts=concepts, question=question)

    if operation_type == "followups":
        followups = [
            f"What experience do you have related to '{keywords[0]}'?"
            if keywords
            else "What example best illustrates your approach?",
            "What tradeoffs did you consider?",
            "What would you do differently next time?",
        ]
        reply = "Likely follow-ups:\n" + "\n".join(f"• {f}" for f in followups)
        return _envelope(operation_type, reply, followups=followups, question=question)

    if operation_type == "answer":
        # Honest coaching scaffold — never invent STAR facts.
        has_resume = bool(resume_context)
        has_answer = bool(transcript)
        lines = [
            f"Interview type: {interview_type or 'behavioral'}.",
            f"Question: {question}",
        ]
        if has_answer:
            lines.append(
                "You already started an answer — tighten it: lead with a one-line thesis, "
                "then 2–3 actions you personally took, then a result you can prove."
            )
        elif has_resume:
            lines.append(
                "Use only experiences present in your resume context. "
                "If you lack a matching example, say so and pick the closest real story — do not invent metrics."
            )
        else:
            lines.append(
                "Insufficient personal context to draft a full spoken answer. "
                "Tell me one real example (company-safe), your role, what you did, and the outcome."
            )
        lines.extend(
            [
                "Structure: Situation (1–2 sentences) → Task → Action (I-statements) → Result.",
                "Do not invent employers, titles, or numbers.",
            ]
        )
        reply = "\n".join(lines)
        return _envelope(
            operation_type,
            reply,
            question=question,
            has_user_answer=has_answer,
            has_resume_context=has_resume,
        )

    # coach_chat
    focus = question or "the current interview topic"
    user_ask = message or "How should I approach this?"
    reply_parts = [
        f"You asked: {user_ask}",
        f"Focus on: {focus}.",
        "1. Answer the question directly in one sentence.",
        "2. Give brief context from your real experience only.",
        "3. Explain 2–3 actions you took (I-statements).",
        "4. Close with a measurable result you can substantiate — or say the qualitative outcome.",
    ]
    if transcript:
        reply_parts.append(
            "From your recent answer: keep what is specific; cut filler; map every sentence back to the question."
        )
    if keywords:
        reply_parts.append("Themes to cover: " + ", ".join(keywords[:5]) + ".")
    reply_parts.append("I will not invent facts — only coach structure and clarity.")
    reply = "\n".join(reply_parts)
    result = _envelope(
        operation_type,
        reply,
        question=question or None,
        message=message or None,
    )
    log.info("[PRACTICE_COACH] completed", operation_id=operation_id, correlation_id=correlation_id)
    return result
