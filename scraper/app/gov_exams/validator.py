"""Question + paper validation — reject invalid payloads; never silent-insert."""
from __future__ import annotations

from typing import Any

from app.document_intelligence.deduplication import compute_normalized_hash
from app.document_intelligence.question_validators import validate_question_integrity
from app.gov_exams.observability import gov_exam_log
from app.gov_exams.schemas import (
    QuestionPayload,
    QuestionValidationResult,
    ValidateQuestionsRequest,
    ValidateQuestionsResponse,
)
from app.paper_factory.models import PaperQuestion
from app.paper_factory.validate import (
    CandidateValidator,
    normalize_options,
    resolve_correct_index,
)


def _as_integrity_dict(payload: QuestionPayload, language: str) -> dict[str, Any]:
    options = normalize_options(payload.options)
    correct = payload.correct_answer
    if correct is None and payload.correct_index is not None:
        if 0 <= payload.correct_index < len(options):
            correct = chr(65 + payload.correct_index)
    return {
        "question_text": payload.question_text,
        "options": [{"text": option} for option in options],
        "correct_answer": correct,
        "marks_positive": payload.marks_positive if payload.marks_positive is not None else 1.0,
        "marks_negative": payload.marks_negative if payload.marks_negative is not None else 0.0,
        "language": payload.language or language,
        "source": payload.source or "UNKNOWN",
        "explanation": payload.explanation or "",
    }


def validate_question_payloads(
    request: ValidateQuestionsRequest,
    *,
    operation_id: str | None = None,
) -> ValidateQuestionsResponse:
    """Validate a list of question payloads; return accepted/rejected with reasons."""
    correlation_id = request.correlation_id
    job_id = request.job_id
    gov_exam_log(
        "validation_started",
        operation_id=operation_id or correlation_id,
        job_id=job_id,
        correlation_id=correlation_id,
        question_count=len(request.questions),
    )

    validator = CandidateValidator()
    accepted: list[QuestionValidationResult] = []
    rejected: list[QuestionValidationResult] = []

    for index, payload in enumerate(request.questions):
        reasons: list[str] = []
        options = normalize_options(payload.options)
        stem = str(payload.question_text or "").strip()

        if len(stem) < 5:
            reasons.append("stem_too_short")
        if len(options) < 2:
            reasons.append("insufficient_options")

        correct_index = payload.correct_index
        if correct_index is None:
            correct_index = resolve_correct_index(payload.correct_answer, len(options))
        if correct_index is None:
            reasons.append("unresolvable_correct_answer")

        integrity = validate_question_integrity(
            _as_integrity_dict(payload, request.language)
        )
        if not integrity["is_valid"]:
            reasons.extend(str(err) for err in integrity["errors"])

        # Official PYQ claims require provenance — reject silent fabrications.
        source = str(payload.source or "").strip().upper()
        meta = payload.metadata or {}
        generated_by = str(meta.get("generated_by") or "").strip().lower()
        if source in {"OFFICIAL_PYP", "PYP", "PREVIOUS YEAR PAPER"} and generated_by in {
            "deterministic_python",
            "ai",
            "python_paper_factory",
        }:
            reasons.append("generated_content_cannot_claim_official_pyq")

        if request.reject_near_duplicates and not reasons and options:
            fingerprint = compute_normalized_hash(stem, options)
            if fingerprint in validator._fingerprints:  # noqa: SLF001
                reasons.append("exact_duplicate")
            else:
                max_sim, verdict = validator._max_similarity(stem, options)  # noqa: SLF001
                if verdict:
                    reasons.append(verdict)
                elif max_sim >= validator.near_duplicate_threshold:
                    reasons.append("near_duplicate")

        if reasons:
            rejected.append(
                QuestionValidationResult(
                    index=index,
                    accepted=False,
                    reasons=reasons,
                    question_id=payload.id,
                )
            )
            continue

        question = PaperQuestion(
            question_text=stem,
            options=options,
            correct_index=int(correct_index or 0),
            section_code=str(payload.subject or "GEN"),
            subject=str(payload.subject or ""),
            topic=str(payload.topic or ""),
            difficulty=str(payload.difficulty or "MEDIUM").upper(),
            explanation=str(payload.explanation or ""),
            source_class="bank",
            source_type=(
                "official_verified"
                if source in {"OFFICIAL_PYP", "PYP", "PREVIOUS YEAR PAPER"}
                else "approved_bank"
            ),
            language=payload.language or request.language,
            question_id=payload.id,
        )
        validator.register(question)
        accepted.append(
            QuestionValidationResult(
                index=index,
                accepted=True,
                reasons=[],
                question_id=payload.id,
            )
        )

    return ValidateQuestionsResponse(
        accepted=accepted,
        rejected=rejected,
        accepted_count=len(accepted),
        rejected_count=len(rejected),
        correlation_id=request.correlation_id,
    )
