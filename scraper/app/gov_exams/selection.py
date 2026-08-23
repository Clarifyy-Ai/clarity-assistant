"""Seeded deterministic question selection from the approved bank."""
from __future__ import annotations

from collections import Counter
from typing import Sequence, TypeVar

from app.document_intelligence.deduplication import compute_normalized_hash
from app.gov_exams.availability import EligibleQuestion, load_eligible_bank
from app.gov_exams.observability import gov_exam_log
from app.gov_exams.schemas import SelectRequest, SelectResponse
from app.paper_factory.repository import PaperRepository

T = TypeVar("T")


def seeded_shuffle(items: Sequence[T], seed: str) -> list[T]:
    """Deterministic shuffle matching Edge `seededShuffle` (FNV-1a + mulberry32)."""
    h = 2166136261
    for char in seed:
        h ^= ord(char)
        h = (h * 16777619) & 0xFFFFFFFF
    state = h & 0xFFFFFFFF

    def rand() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = (t ^ (t >> 15)) * (t | 1) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    arr = list(items)
    for i in range(len(arr) - 1, 0, -1):
        j = int(rand() * (i + 1))
        arr[i], arr[j] = arr[j], arr[i]
    return arr


def select_questions(
    repo: PaperRepository,
    request: SelectRequest,
    *,
    operation_id: str | None = None,
) -> SelectResponse:
    """Select question IDs only — never returns full bank payloads to the caller."""
    correlation_id = request.correlation_id
    job_id = request.job_id
    seed = request.seed or job_id or correlation_id or request.exam_id

    gov_exam_log(
        "selection_started",
        operation_id=operation_id or correlation_id,
        job_id=job_id,
        correlation_id=correlation_id,
        exam_id=request.exam_id,
        question_count=request.question_count,
        seed=seed,
    )

    exam = repo.resolve_exam(request.exam_id, request.stage_id)
    rows, keys = load_eligible_bank(
        repo,
        exam,
        language=request.language,
        topics=request.topics,
        difficulty=request.difficulty,
    )

    shuffled = seeded_shuffle(rows, seed)
    selected: list[EligibleQuestion] = []
    seen: set[str] = set()
    rejected_duplicates = 0
    exclude_ids = {str(item).strip() for item in request.exclude_ids if str(item).strip()}

    for row in shuffled:
        if len(selected) >= request.question_count:
            break
        if row.id in exclude_ids:
            continue
        fp = compute_normalized_hash(row.question_text, row.options)
        if fp in seen:
            rejected_duplicates += 1
            continue
        seen.add(fp)
        selected.append(row)

    section_counts: Counter[str] = Counter()
    for row in selected:
        section_counts[(row.subject or row.topic or "general").strip() or "general"] += 1

    return SelectResponse(
        selected_ids=[row.id for row in selected],
        selected_count=len(selected),
        available_count=len(rows),
        requested=request.question_count,
        seed=seed,
        exam_type_keys=keys,
        rejected_duplicates=rejected_duplicates,
        section_counts=dict(section_counts),
    )
