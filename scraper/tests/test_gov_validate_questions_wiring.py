"""validate-questions endpoint and engine wiring."""
from __future__ import annotations

from app.gov_exams.schemas import QuestionPayload, ValidateQuestionsRequest
from app.gov_exams.validator import validate_question_payloads


def test_validate_questions_rejects_official_pyq_fabrication() -> None:
    """Generated content cannot claim official PYQ provenance."""
    req = ValidateQuestionsRequest(
        questions=[
            QuestionPayload(
                question_text="What is 2+2?",
                options=["3", "4", "5", "6"],
                correct_index=1,
                source="OFFICIAL_PYP",
                metadata={"generated_by": "deterministic_python"},
            )
        ],
        correlation_id="corr-1",
        language="en",
    )
    result = validate_question_payloads(req, operation_id="op-1")
    assert result.rejected_count == 1
    assert "generated_content_cannot_claim_official_pyq" in result.rejected[0].reasons


def test_validate_questions_accepts_valid_mcq() -> None:
    req = ValidateQuestionsRequest(
        questions=[
            QuestionPayload(
                question_text="Capital of India?",
                options=["Mumbai", "Delhi", "Kolkata", "Chennai"],
                correct_index=1,
                source="approved_bank",
            )
        ],
        correlation_id="corr-2",
        language="en",
    )
    result = validate_question_payloads(req, operation_id="op-2")
    assert result.accepted_count == 1
    assert result.rejected_count == 0
