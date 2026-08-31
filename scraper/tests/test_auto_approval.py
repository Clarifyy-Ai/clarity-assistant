"""Tests for deterministic auto-approval rule engine."""
from __future__ import annotations

from app.gov_exams.auto_approval import (
    AutoApprovalRuleConfig,
    PaperValidationInput,
    QuestionValidationInput,
    evaluate_paper_auto_approval,
    evaluate_question_auto_approval,
    initial_paper_review_state,
)


def _valid_question(**overrides) -> QuestionValidationInput:
    base = QuestionValidationInput(
        source_type="official_verified",
        quality_score=85,
        quality_hard_fail=False,
        hard_fail_codes=[],
        duplicate_status="unique",
        has_provenance=True,
    )
    for k, v in overrides.items():
        setattr(base, k, v)
    return base


class TestInitialPaperReviewState:
    def test_hard_fails_need_review(self):
        assert initial_paper_review_state(90, 1, 0) == "needs_review"

    def test_review_queue_needs_review(self):
        assert initial_paper_review_state(90, 0, 3) == "needs_review"

    def test_low_quality_needs_review(self):
        assert initial_paper_review_state(30, 0, 0) == "needs_review"

    def test_clean_pass_machine_validated(self):
        assert initial_paper_review_state(85, 0, 0) == "machine_validated"


class TestQuestionAutoApproval:
    def test_disabled_never_auto_approves(self):
        r = evaluate_question_auto_approval(_valid_question())
        assert r.outcome == "MANUAL_REVIEW"

    def test_official_source_auto_approved_when_enabled(self):
        rule = AutoApprovalRuleConfig(enabled=True)
        r = evaluate_question_auto_approval(_valid_question(), rule)
        assert r.outcome == "AUTO_APPROVED"
        assert r.approval_mode == "AUTO"

    def test_duplicate_rejected(self):
        rule = AutoApprovalRuleConfig(enabled=True)
        r = evaluate_question_auto_approval(
            _valid_question(duplicate_status="exact_duplicate"), rule
        )
        assert r.outcome == "REJECTED"

    def test_ai_never_official(self):
        rule = AutoApprovalRuleConfig(enabled=True, allow_ai_generated_practice=True)
        r = evaluate_question_auto_approval(
            _valid_question(
                source_type="ai_generated_practice",
                hard_fail_codes=["OFFICIAL_CLAIM"],
            ),
            rule,
        )
        assert r.outcome == "MANUAL_REVIEW"


class TestPaperAutoApproval:
    def test_blueprint_failure_manual_review(self):
        rule = AutoApprovalRuleConfig(entity_type="paper", enabled=True)
        inp = PaperValidationInput(
            source_type="approved_bank",
            quality_score=90,
            quality_hard_fail=False,
            hard_fail_codes=[],
            duplicate_status="unique",
            has_provenance=True,
            blueprint_valid=False,
        )
        r = evaluate_paper_auto_approval(inp, rule)
        assert r.outcome == "MANUAL_REVIEW"
