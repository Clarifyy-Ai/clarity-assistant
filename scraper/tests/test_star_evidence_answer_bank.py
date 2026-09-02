"""Unit tests for Answer Bank prompt parsing in star_evidence."""

from __future__ import annotations

from app.engines.star_evidence import run_star_evidence


def test_answer_bank_question_only_builds_star_scaffold() -> None:
    payload = {
        "operation_type": "star_method",
        "situation": "",
        "task": "",
        "action": (
            "Interview question:\nTell me about a time you failed.\n\n"
            "Category: Behavioural\n\n"
            "User draft (optional):\n(none yet)\n\n"
            "Improve structure into a STAR answer for THIS exact question."
        ),
        "result": "",
        "input": (
            "Interview question:\nTell me about a time you failed.\n\n"
            "Category: Behavioural\n\n"
            "User draft (optional):\n(none yet)\n\n"
            "Improve structure into a STAR answer for THIS exact question."
        ),
    }

    result = run_star_evidence(payload, operation_id="op-ab-1", correlation_id="corr-ab-1")
    draft = result["star_draft"]

    assert "Tell me about a time you failed" in draft["task"]
    assert draft["action"].startswith("[NEEDS EVIDENCE")
    assert draft["result"] == "[Add measurable result if available]"
    assert any("situation" in q.lower() for q in result["follow_up_questions"])


def test_answer_bank_user_draft_with_star_labels_is_preserved() -> None:
    payload = {
        "input": (
            "Interview question:\nDescribe a leadership challenge.\n\n"
            "Category: Leadership\n\n"
            "User draft (optional):\n"
            "Situation: Our team missed a release date.\n"
            "Task: Recover trust with stakeholders.\n"
            "Action: I reset priorities and ran daily check-ins.\n"
            "Result: We shipped two weeks later with zero regressions.\n\n"
            "Improve structure into a STAR answer."
        ),
    }

    result = run_star_evidence(payload, operation_id="op-ab-2", correlation_id="corr-ab-2")
    draft = result["star_draft"]

    assert "missed a release date" in draft["situation"]
    assert "Recover trust" in draft["task"]
    assert "daily check-ins" in draft["action"]
    assert "zero regressions" in draft["result"]


def test_explicit_star_fields_bypass_answer_bank_parser() -> None:
    payload = {
        "situation": "At Acme Corp we had an outage.",
        "task": "Restore service within one hour.",
        "action": "I led the incident bridge and rolled back.",
        "result": "Service restored in 42 minutes.",
    }

    result = run_star_evidence(payload, operation_id="op-ab-3", correlation_id="corr-ab-3")
    draft = result["star_draft"]

    assert draft["situation"].startswith("At Acme Corp")
    assert draft["task"].startswith("Restore service")
    assert "rolled back" in draft["action"]
    assert "42 minutes" in draft["result"]
