"""Deterministic auto-approval rule engine (Python mirror of Edge govAutoApproval).

Python validates, deduplicates, and scores — it NEVER grants admin privileges.
Returns evaluation outcome for Edge orchestration to persist.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

MIN_QUALITY_SCORE = 40.0

AutoApprovalOutcome = Literal[
    "AUTO_APPROVED", "MANUAL_REVIEW", "REJECTED", "AUTO_APPROVAL_FAILED"
]

NEVER_OFFICIAL_SOURCE_TYPES = frozenset({
    "ai_generated_practice",
    "generated_practice",
})

ALWAYS_MANUAL_FLAGS = frozenset({
    "OCR_UNCERTAIN", "ANSWER_KEY_CONFLICT", "POLICY_FLAG", "SOURCE_CONFLICT",
    "AI_AS_OFFICIAL", "MALFORMED", "MISSING_PROVENANCE", "NEAR_DUPLICATE",
    "EXACT_DUPLICATE", "LOW_QUALITY", "UNRESOLVED_REVIEW_FLAG",
    "BLUEPRINT_VIOLATION", "QUESTION_COUNT_MISMATCH",
})


@dataclass
class AutoApprovalRuleConfig:
    entity_type: Literal["question", "paper"] = "question"
    rule_version: int = 1
    enabled: bool = False
    min_quality_score: float = MIN_QUALITY_SCORE
    duplicate_threshold: float = 0.92
    auto_publish: bool = False
    allowed_source_types: list[str] = field(default_factory=lambda: [
        "official_verified", "verified_public_source", "approved_bank",
        "internal_question_bank", "generated_practice", "ai_generated_practice",
    ])
    allowed_exam_ids: list[str] | None = None
    allowed_languages: list[str] | None = None
    allow_verified_public: bool = False
    allow_internal_bank: bool = True
    allow_generated_practice: bool = True
    allow_ai_generated_practice: bool = True
    require_provenance: bool = True


@dataclass
class QuestionValidationInput:
    source_type: str
    quality_score: float
    quality_hard_fail: bool
    hard_fail_codes: list[str]
    duplicate_status: str
    has_provenance: bool
    has_valid_exam: bool = True
    has_valid_stage: bool = True
    has_valid_section: bool = True
    has_valid_subject: bool = True
    has_valid_language: bool = True
    has_valid_options: bool = True
    has_valid_answer: bool = True
    has_valid_difficulty: bool = True
    ocr_uncertainty: bool = False
    answer_key_conflict: bool = False
    policy_violation: bool = False
    unresolved_review_flag: bool = False
    source_approved: bool = True
    exam_id: str | None = None
    language: str | None = None


@dataclass
class PaperValidationInput:
    source_type: str
    quality_score: float
    quality_hard_fail: bool
    hard_fail_codes: list[str]
    duplicate_status: str
    has_provenance: bool
    blueprint_valid: bool = True
    question_count_match: bool = True
    section_quotas_met: bool = True
    topic_quotas_met: bool = True
    difficulty_valid: bool = True
    language_valid: bool = True
    marks_valid: bool = True
    negative_marking_valid: bool = True
    all_questions_validated: bool = True
    hard_fail_count: int = 0
    review_queue_length: int = 0
    exam_id: str | None = None
    language: str | None = None


@dataclass
class AutoApprovalEvaluation:
    outcome: AutoApprovalOutcome
    approval_mode: str | None
    rule_version: int | None
    flags: list[str]
    rule_results: list[dict[str, Any]]
    source_type: str
    quality_score: float
    duplicate_result: str
    auto_publish: bool
    previous_status: str
    new_status: str
    publish_status: str


def parse_rule_row(row: dict[str, Any]) -> AutoApprovalRuleConfig:
    return AutoApprovalRuleConfig(
        entity_type="paper" if row.get("entity_type") == "paper" else "question",
        rule_version=int(row.get("rule_version") or 1),
        enabled=bool(row.get("enabled")),
        min_quality_score=float(row.get("min_quality_score") or MIN_QUALITY_SCORE),
        duplicate_threshold=float(row.get("duplicate_threshold") or 0.92),
        auto_publish=bool(row.get("auto_publish")),
        allowed_source_types=list(row.get("allowed_source_types") or AutoApprovalRuleConfig().allowed_source_types),
        allowed_exam_ids=list(row["allowed_exam_ids"]) if row.get("allowed_exam_ids") else None,
        allowed_languages=list(row["allowed_languages"]) if row.get("allowed_languages") else None,
        allow_verified_public=bool(row.get("allow_verified_public")),
        allow_internal_bank=row.get("allow_internal_bank", True) is not False,
        allow_generated_practice=row.get("allow_generated_practice", True) is not False,
        allow_ai_generated_practice=row.get("allow_ai_generated_practice", True) is not False,
        require_provenance=row.get("require_provenance", True) is not False,
    )


def initial_paper_review_state(
    quality_score: float,
    hard_fail_count: int,
    review_queue_len: int,
    *,
    min_quality: float = MIN_QUALITY_SCORE,
) -> str:
    """Deterministic review_state — never auto-approve on failure."""
    if hard_fail_count > 0 or review_queue_len > 0:
        return "needs_review"
    if quality_score < min_quality:
        return "needs_review"
    return "machine_validated"


def evaluate_question_auto_approval(
    inp: QuestionValidationInput,
    rule: AutoApprovalRuleConfig | None = None,
) -> AutoApprovalEvaluation:
    rule = rule or AutoApprovalRuleConfig()
    flags: list[str] = []
    results: list[dict[str, Any]] = []

    base = AutoApprovalEvaluation(
        outcome="MANUAL_REVIEW",
        approval_mode=None,
        rule_version=rule.rule_version,
        flags=flags,
        rule_results=results,
        source_type=inp.source_type,
        quality_score=inp.quality_score,
        duplicate_result=inp.duplicate_status,
        auto_publish=False,
        previous_status="review_required",
        new_status="review_required",
        publish_status="draft",
    )

    try:
        if not rule.enabled:
            results.append({"rule": "auto_approval_enabled", "passed": False})
            flags.append("AUTO_APPROVAL_DISABLED")
            return base

        if rule.require_provenance and not inp.has_provenance:
            flags.append("MISSING_PROVENANCE")
            results.append({"rule": "provenance", "passed": False})
            return base

        if inp.quality_hard_fail or inp.quality_score < rule.min_quality_score:
            flags.append("LOW_QUALITY")
            results.append({"rule": "quality_threshold", "passed": False})
            return base

        if inp.duplicate_status in ("exact_duplicate", "near_duplicate"):
            flags.append(inp.duplicate_status.upper())
            outcome: AutoApprovalOutcome = "REJECTED" if inp.duplicate_status == "exact_duplicate" else "MANUAL_REVIEW"
            return AutoApprovalEvaluation(
                **{**base.__dict__, "outcome": outcome, "flags": flags,
                   "new_status": "rejected" if outcome == "REJECTED" else "review_required"}
            )

        if inp.source_type not in rule.allowed_source_types:
            flags.append("POLICY_FLAG")
            return base

        if inp.source_type == "verified_public_source" and not rule.allow_verified_public:
            flags.append("POLICY_FLAG")
            return base

        if inp.source_type == "ai_generated_practice" and not rule.allow_ai_generated_practice:
            flags.append("POLICY_FLAG")
            return base

        if inp.source_type == "generated_practice" and not rule.allow_generated_practice:
            flags.append("POLICY_FLAG")
            return base

        # Hard validation checks
        checks = [
            (inp.has_valid_exam, "valid_exam"),
            (inp.has_valid_options, "valid_options"),
            (inp.has_valid_answer, "valid_answer"),
            (not inp.ocr_uncertainty, "ocr_certainty"),
            (not inp.answer_key_conflict, "answer_key"),
            (not inp.policy_violation, "policy"),
            (not inp.unresolved_review_flag, "review_flag"),
            (inp.source_approved, "approved_source"),
        ]
        for passed, name in checks:
            results.append({"rule": name, "passed": passed})
            if not passed:
                flags.append("MALFORMED" if name.startswith("valid_") else name.upper())

        if inp.source_type in NEVER_OFFICIAL_SOURCE_TYPES and "OFFICIAL_CLAIM" in inp.hard_fail_codes:
            flags.append("AI_AS_OFFICIAL")
            return base

        if flags:
            return AutoApprovalEvaluation(**{**base.__dict__, "flags": flags})

        return AutoApprovalEvaluation(
            outcome="AUTO_APPROVED",
            approval_mode="AUTO",
            rule_version=rule.rule_version,
            flags=flags,
            rule_results=results,
            source_type=inp.source_type,
            quality_score=inp.quality_score,
            duplicate_result=inp.duplicate_status,
            auto_publish=rule.auto_publish,
            previous_status="review_required",
            new_status="approved",
            publish_status="published" if rule.auto_publish else "draft",
        )
    except Exception as exc:
        flags.append("AUTO_APPROVAL_FAILED")
        results.append({"rule": "engine", "passed": False, "detail": str(exc)})
        return AutoApprovalEvaluation(
            **{**base.__dict__, "outcome": "AUTO_APPROVAL_FAILED", "flags": flags}
        )


def evaluate_paper_auto_approval(
    inp: PaperValidationInput,
    rule: AutoApprovalRuleConfig | None = None,
) -> AutoApprovalEvaluation:
    rule = rule or AutoApprovalRuleConfig(entity_type="paper", allow_generated_practice=False, allow_ai_generated_practice=False)
    flags: list[str] = []
    results: list[dict[str, Any]] = []

    base = AutoApprovalEvaluation(
        outcome="MANUAL_REVIEW",
        approval_mode=None,
        rule_version=rule.rule_version,
        flags=flags,
        rule_results=results,
        source_type=inp.source_type,
        quality_score=inp.quality_score,
        duplicate_result=inp.duplicate_status,
        auto_publish=False,
        previous_status="machine_validated",
        new_status="needs_review",
        publish_status="draft",
    )

    try:
        if not rule.enabled:
            flags.append("AUTO_APPROVAL_DISABLED")
            return base

        if inp.hard_fail_count > 0 or inp.review_queue_length > 0:
            flags.append("UNRESOLVED_REVIEW_FLAG")
            return base

        paper_checks = [
            (inp.blueprint_valid, "blueprint_valid", "BLUEPRINT_VIOLATION"),
            (inp.question_count_match, "question_count", "QUESTION_COUNT_MISMATCH"),
            (inp.section_quotas_met, "section_quotas", "BLUEPRINT_VIOLATION"),
            (inp.all_questions_validated, "all_questions_valid", "MALFORMED"),
        ]
        for passed, name, flag in paper_checks:
            results.append({"rule": name, "passed": passed})
            if not passed:
                flags.append(flag)
                return base

        if inp.quality_hard_fail or inp.quality_score < rule.min_quality_score:
            flags.append("LOW_QUALITY")
            return base

        if not rule.enabled:
            return base

        return AutoApprovalEvaluation(
            outcome="AUTO_APPROVED",
            approval_mode="AUTO",
            rule_version=rule.rule_version,
            flags=flags,
            rule_results=results,
            source_type=inp.source_type,
            quality_score=inp.quality_score,
            duplicate_result=inp.duplicate_status,
            auto_publish=rule.auto_publish,
            previous_status="machine_validated",
            new_status="approved",
            publish_status="published" if rule.auto_publish else "draft",
        )
    except Exception as exc:
        flags.append("AUTO_APPROVAL_FAILED")
        return AutoApprovalEvaluation(
            **{**base.__dict__, "outcome": "AUTO_APPROVAL_FAILED", "flags": flags}
        )
