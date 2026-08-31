"""Deterministic bank availability calculation — no AI."""
from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass, replace
from typing import Any, Sequence

from app.document_intelligence.deduplication import (
    QuestionDeduplicationEngine,
    compute_normalized_hash,
)
from app.gov_exams.observability import gov_exam_log
from app.gov_exams.schemas import AvailabilityRequest, AvailabilityResponse
from app.paper_factory.models import ExamContext, PaperFactoryError
from app.paper_factory.repository import (
    PaperRepository,
    _letter_to_index,
    _options_to_texts,
)

# Minimum unique bank items for a honest custom practice set.
MIN_CUSTOM_PRACTICE = 5

_ENGLISH_ALIASES = frozenset({"", "en", "eng", "english"})


@dataclass(frozen=True)
class EligibleQuestion:
    id: str
    question_text: str
    options: list[str]
    correct_index: int
    subject: str
    topic: str
    difficulty: str
    exam_type: str
    source: str
    source_type: str = ""
    is_verified: bool = False
    language: str = ""


def _topic_needles(topics: Sequence[str]) -> list[str]:
    return [t.strip().lower() for t in topics if str(t or "").strip()][:20]


def _matches_topics(row: dict[str, Any], needles: Sequence[str]) -> bool:
    if not needles:
        return True
    subject = str(row.get("subject") or "").strip().lower()
    topic = str(row.get("topic") or "").strip().lower()
    return any(
        needle in subject
        or needle in topic
        or (subject and subject in needle)
        or (topic and topic in needle)
        for needle in needles
    )


def _row_language(row: dict[str, Any]) -> str:
    stored = str(row.get("language") or "").strip().lower()
    if stored:
        return stored
    meta = row.get("metadata")
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except json.JSONDecodeError:
            meta = None
    if isinstance(meta, dict):
        return str(meta.get("language") or "").strip().lower()
    return ""


def _language_ok(row: dict[str, Any], language: str, *, skip_language: bool) -> bool:
    """Never silently switch language. English may include untagged bank rows."""
    if skip_language:
        return True
    wanted = (language or "en").strip().lower()
    stored = _row_language(row)
    if wanted in _ENGLISH_ALIASES:
        return stored in _ENGLISH_ALIASES or stored.startswith("en")
    if not stored:
        return False
    return stored == wanted or stored.startswith(wanted)


def load_eligible_bank(
    repo: PaperRepository,
    exam: ExamContext,
    *,
    language: str = "en",
    topics: Sequence[str] | None = None,
    difficulty: str | None = None,
    limit: int = 2500,
    verified_only: bool = True,
    skip_language: bool = False,
) -> tuple[list[EligibleQuestion], list[str]]:
    """Load approved public bank rows matching exam type keys + filters."""
    keys = list(exam.bank_type_keys)
    if not keys:
        return [], []

    query = (
        repo.db.table("questions")
        .select(
            "id, question_text, options, correct_answer, subject, topic, "
            "difficulty, exam_type, source, source_type, is_public, is_verified, "
            "metadata, publish_status, review_status"
        )
        .in_("exam_type", keys)
        .eq("is_public", True)
        .eq("publish_status", "published")
        .eq("review_status", "approved")
        .limit(limit)
    )
    if verified_only:
        query = query.eq("is_verified", True)
    if difficulty:
        query = query.eq("difficulty", difficulty.upper())

    result = query.execute()
    needles = _topic_needles(topics or [])
    engine = QuestionDeduplicationEngine()
    kept: list[EligibleQuestion] = []
    seen_hashes: set[str] = set()
    fingerprints: list[tuple[str, list[str]]] = []

    for row in result.data or []:
        if not _matches_topics(row, needles):
            continue
        if not _language_ok(row, language, skip_language=skip_language):
            continue
        publish = str(row.get("publish_status") or "published").lower()
        if publish in ("archived", "rejected", "draft", "hidden"):
            continue

        options = _options_to_texts(row.get("options"))
        stem = str(row.get("question_text") or "").strip()
        if len(stem) < 5 or len(options) < 2:
            continue
        correct_index = _letter_to_index(row.get("correct_answer"), len(options))
        if correct_index < 0:
            continue

        fingerprint = compute_normalized_hash(stem, options)
        if fingerprint in seen_hashes:
            continue

        is_near_dup = False
        for prior_stem, prior_opts in fingerprints:
            decision = engine.evaluate_pair(stem, options, prior_stem, prior_opts)
            if decision["decision"] in ("exact_duplicate", "near_duplicate", "template_clone"):
                is_near_dup = True
                break
        if is_near_dup:
            continue

        seen_hashes.add(fingerprint)
        fingerprints.append((stem, options))
        kept.append(
            EligibleQuestion(
                id=str(row["id"]),
                question_text=stem,
                options=options,
                correct_index=correct_index,
                subject=str(row.get("subject") or ""),
                topic=str(row.get("topic") or ""),
                difficulty=str(row.get("difficulty") or "MEDIUM"),
                exam_type=str(row.get("exam_type") or ""),
                source=str(row.get("source") or ""),
                source_type=str(row.get("source_type") or ""),
                is_verified=bool(row.get("is_verified")),
                language=_row_language(row),
            )
        )

    return kept, keys


def section_coverage(rows: Sequence[EligibleQuestion]) -> dict[str, int]:
    counter: Counter[str] = Counter()
    for row in rows:
        key = (row.subject or row.topic or "general").strip() or "general"
        counter[key] += 1
    return dict(counter.most_common(40))


def compute_availability(
    repo: PaperRepository,
    request: AvailabilityRequest,
    *,
    operation_id: str | None = None,
) -> AvailabilityResponse:
    """Count unique eligible bank questions for the requested configuration."""
    correlation_id = request.correlation_id
    job_id = request.job_id
    mode = str(request.mode or "generated_mock")
    verified_only = mode == "official_previous"
    gov_exam_log(
        "availability_started",
        operation_id=operation_id or correlation_id,
        job_id=job_id,
        correlation_id=correlation_id,
        exam_id=request.exam_id,
        question_count=request.question_count,
        language=request.language,
        mode=mode,
    )

    exam = repo.resolve_exam(request.exam_id, request.stage_id)
    if request.bank_type_keys:
        exam = replace(exam, bank_type_keys=tuple(request.bank_type_keys))

    eligible_rows, keys = load_eligible_bank(
        repo,
        exam,
        language=request.language,
        topics=request.topics,
        difficulty=request.difficulty,
        verified_only=verified_only,
        skip_language=True,
    )
    available_rows, _ = load_eligible_bank(
        repo,
        exam,
        language=request.language,
        topics=request.topics,
        difficulty=request.difficulty,
        verified_only=verified_only,
        skip_language=False,
    )

    eligible = len(eligible_rows)
    available = len(available_rows)
    requested = request.question_count
    missing = max(0, requested - available)
    can_full = available >= requested
    can_custom = available >= MIN_CUSTOM_PRACTICE
    coverage = section_coverage(available_rows)

    wanted = (request.language or "en").strip().lower()
    language_available = True
    blocked_reason: str | None = None
    if wanted not in _ENGLISH_ALIASES and available == 0 and eligible > 0:
        language_available = False
        blocked_reason = "LANGUAGE_UNAVAILABLE"
        raise PaperFactoryError(
            "LANGUAGE_UNAVAILABLE",
            f"No approved questions are available in language '{request.language}'.",
            retryable=False,
        )

    response = AvailabilityResponse(
        requested=requested,
        eligible=eligible,
        available=available,
        missing=missing,
        can_full_mock=can_full,
        can_custom_practice=can_custom,
        custom_practice_max=available,
        exam_type_keys=keys,
        section_coverage=coverage,
        language_available=language_available,
        blocked_reason=blocked_reason,
        mode=mode,
    )

    gov_exam_log(
        "availability_completed",
        operation_id=operation_id or correlation_id,
        job_id=job_id,
        correlation_id=correlation_id,
        available=available,
        eligible=eligible,
        missing=missing,
        can_full_mock=can_full,
        can_custom_practice=can_custom,
        language_available=language_available,
    )
    return response
