"""Practice coach engine contracts — coach_chat must not return STAR chat scaffolds."""

from __future__ import annotations

import pytest

from app.engines.practice_coach import run_practice_coach
from app.engines.schemas import EngineError


def test_coach_chat_raises_unavailable_instead_of_you_asked_scaffold():
    with pytest.raises(EngineError) as exc:
        run_practice_coach(
            {
                "operation_type": "coach_chat",
                "message": "hello",
                "question": "behavioral",
            },
            operation_id="op_test",
            correlation_id="corr_test",
        )
    assert exc.value.code == "COACH_AI_UNAVAILABLE"
    assert exc.value.retryable is True


def test_coach_chat_requires_message_or_question():
    with pytest.raises(EngineError) as exc:
        run_practice_coach(
            {"operation_type": "coach_chat"},
            operation_id="op_test",
            correlation_id="corr_test",
        )
    assert exc.value.code == "MESSAGE_REQUIRED"


def test_hint_still_returns_scaffold():
    result = run_practice_coach(
        {
            "operation_type": "hint",
            "question": "Tell me about a time you led a project.",
        },
        operation_id="op_test",
        correlation_id="corr_test",
    )
    assert result["operation_type"] == "hint"
    assert result["reply"]
    assert "You asked:" not in result["reply"]
    assert "I will not invent facts" not in result["reply"]
