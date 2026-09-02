"""Tests for prep_answer_outline (Answer Bank Technical / raw_prompt scaffold)."""

from __future__ import annotations

from app.hybrid.operations import prep_answer_outline, run_operation


def _assert_truthful(result: dict) -> None:
    assert isinstance(result, dict)
    assert result.get("source") == "python_template"
    assert result.get("invented_facts") is False
    assert result.get("evidence_only") is True


class TestPrepAnswerOutline:
    def test_empty_payload(self) -> None:
        result = prep_answer_outline({})
        _assert_truthful(result)
        assert result["format"] == "interview_answer_outline"
        assert result["category"] == "General"
        assert result["question"] == "this question"
        assert result["user_draft"] is None
        assert "[NEEDS EVIDENCE]" in result["outline"]
        assert len(result["outline"]) >= 80

    def test_parses_answer_bank_prompt(self) -> None:
        prompt = (
            "Interview category: Technical\n"
            "Interview question:\n"
            "How would you design a rate limiter?\n\n"
            "User draft (optional):\n"
            "I used token bucket at my last role.\n\n"
            "Write a strong interview-ready answer for this exact question."
        )
        result = prep_answer_outline({"input": prompt})
        _assert_truthful(result)
        assert result["category"] == "Technical"
        assert "rate limiter" in result["question"]
        assert "token bucket" in (result["user_draft"] or "")
        assert "token bucket" in result["outline"]
        assert "[NEEDS EVIDENCE]" in result["outline"]

    def test_ignores_none_yet_draft(self) -> None:
        prompt = (
            "Interview category: HR\n"
            "Interview question:\n"
            "Why this company?\n\n"
            "User draft (optional):\n"
            "(none yet)\n\n"
            "Write a strong interview-ready answer."
        )
        result = prep_answer_outline({"text": prompt})
        _assert_truthful(result)
        assert result["user_draft"] is None
        assert "Your draft" not in result["outline"]

    def test_explicit_payload_fields(self) -> None:
        result = prep_answer_outline(
            {
                "category": "System Design",
                "question": "Design a chat app",
                "user_draft": "WebSockets for delivery",
            }
        )
        _assert_truthful(result)
        assert result["category"] == "System Design"
        assert result["question"] == "Design a chat app"
        assert "WebSockets" in result["outline"]

    def test_prep_raw_prompt_alias_dispatch(self) -> None:
        result = run_operation(
            "prep_raw_prompt",
            {
                "category": "Technical",
                "question": "Explain CAP theorem",
            },
        )
        _assert_truthful(result)
        assert "CAP theorem" in result["outline"]
