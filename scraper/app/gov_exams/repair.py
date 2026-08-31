"""Bounded paper repair: replace rejected/missing items without invalid padding."""
from __future__ import annotations

from collections import Counter
from collections.abc import Callable, Iterable, Sequence

from app.gov_exams.deterministic_generate import (
    PRACTICE_DISCLAIMER,
    generate_practice_variants,
)
from app.gov_exams.slot_fill import match_bank_to_sections, paper_from_bank_item
from app.paper_factory.models import PaperBlueprint, PaperQuestion
from app.paper_factory.repository import BankQuestion
from app.paper_factory.validate import MIN_QUALITY_SCORE, score_assembled_question


def drop_rejected(questions: Sequence[PaperQuestion], indices: set[int]) -> list[PaperQuestion]:
    return [q for i, q in enumerate(questions) if i not in indices]


def section_shortfalls(
    blueprint: PaperBlueprint, questions: Sequence[PaperQuestion]
) -> dict[str, int]:
    counts: Counter[str] = Counter(q.section_code for q in questions)
    out: dict[str, int] = {}
    for section in blueprint.sections:
        need = section.question_count - counts.get(section.code, 0)
        if need > 0:
            out[section.code] = need
    return out


def total_shortfall(blueprint: PaperBlueprint, questions: Sequence[PaperQuestion]) -> int:
    return max(0, blueprint.total_questions - len(questions))


def fill_leftovers_section_safe(
    blueprint: PaperBlueprint,
    questions: list[PaperQuestion],
    leftovers: Sequence[BankQuestion],
    *,
    mode: str,
) -> tuple[list[PaperQuestion], list[BankQuestion]]:
    """Place leftover bank items only into sections they match, under remaining quota."""
    used = {q.question_id for q in questions if q.question_id}
    available = [item for item in leftovers if item.id not in used]
    buckets = match_bank_to_sections(available, blueprint)
    shortfalls = section_shortfalls(blueprint, questions)

    for code, need in list(shortfalls.items()):
        for item in buckets.get(code, []):
            if need <= 0:
                break
            if item.id in used:
                continue
            peers = [q.question_text for q in questions]
            paper = paper_from_bank_item(item, code, blueprint, peers, mode=mode)
            if paper is None:
                continue
            questions.append(paper)
            used.add(item.id)
            need -= 1
        shortfalls[code] = need

    leftover_out = [item for item in leftovers if item.id not in used]
    return questions, leftover_out


def fill_deterministic_shortfalls(
    blueprint: PaperBlueprint,
    questions: list[PaperQuestion],
    *,
    seed: str,
    remaining_cap: int | None = None,
) -> list[PaperQuestion]:
    """Section-aware deterministic practice fill. Never dumps into a default section."""
    shortfalls = section_shortfalls(blueprint, questions)
    if remaining_cap is None:
        remaining_cap = total_shortfall(blueprint, questions)
    if remaining_cap <= 0 or not shortfalls:
        return questions

    inserted = 0
    for section in blueprint.sections:
        need = shortfalls.get(section.code, 0)
        if need <= 0 or inserted >= remaining_cap:
            continue
        take = min(need, remaining_cap - inserted)
        variants = generate_practice_variants(
            count=take,
            seed=f"{seed}:{section.code}:repair",
            section_code=section.code,
            section_name=section.name,
        )
        for variant in variants:
            if inserted >= remaining_cap:
                break
            peers = [q.question_text for q in questions]
            score = score_assembled_question(
                stem=variant.question_text,
                options=list(variant.options),
                correct_index=variant.correct_index,
                explanation=variant.explanation,
                peers=peers,
                source_confidence=0.55,
            )
            if score < MIN_QUALITY_SCORE:
                continue
            questions.append(
                PaperQuestion(
                    question_text=variant.question_text,
                    options=list(variant.options),
                    correct_index=variant.correct_index,
                    section_code=section.code,
                    subject=variant.subject,
                    topic=variant.topic,
                    difficulty=variant.difficulty,
                    explanation=f"{variant.explanation} {PRACTICE_DISCLAIMER}",
                    marks_positive=blueprint.marks_per_question,
                    marks_negative=blueprint.negative_mark,
                    source_class="deterministic",
                    source_type="generated_practice",
                    language=blueprint.language,
                    quality_score=score,
                    python_generated=True,
                    ai_generated=False,
                    generated_practice=True,
                    question_source_type="generated_practice",
                )
            )
            inserted += 1
    return questions


def _rejected_index_set(raw: object) -> set[int]:
    if not raw:
        return set()
    if isinstance(raw, set):
        return {int(i) for i in raw}
    if isinstance(raw, Iterable) and not isinstance(raw, (str, bytes)):
        return {int(i) for i in raw}
    return set()


def repair_paper(
    blueprint: PaperBlueprint,
    questions: Sequence[PaperQuestion],
    leftovers: Sequence[BankQuestion],
    *,
    mode: str,
    allow_det: bool,
    seed: str,
    max_rounds: int,
    validate_fn: Callable[[list[PaperQuestion]], set[int] | Sequence[int]] | None = None,
) -> tuple[list[PaperQuestion], list[BankQuestion], int]:
    """Bounded leftover + optional deterministic repair. Never calls AI.

    Each round drops `validate_fn` rejections (if provided), fills section
    shortfalls from leftovers (never a default_section dump), then optionally
    fills remaining shortfalls deterministically when `allow_det` is true.
    """
    assembled = list(questions)
    remaining = list(leftovers)
    det_added = 0
    n_rounds = max(1, int(max_rounds))

    for round_index in range(n_rounds):
        if validate_fn is not None:
            rejected = _rejected_index_set(validate_fn(assembled))
            if rejected:
                assembled = drop_rejected(assembled, rejected)

        shortfalls = section_shortfalls(blueprint, assembled)
        if not shortfalls and total_shortfall(blueprint, assembled) <= 0:
            break

        assembled, remaining = fill_leftovers_section_safe(
            blueprint, assembled, remaining, mode=mode
        )

        still = total_shortfall(blueprint, assembled)
        if still > 0 and allow_det:
            before = len(assembled)
            assembled = fill_deterministic_shortfalls(
                blueprint,
                assembled,
                seed=f"{seed}:repair:{round_index}",
                remaining_cap=still,
            )
            det_added += max(0, len(assembled) - before)

    # Drop anything still invalid so we never return freshly appended rejects.
    if validate_fn is not None and assembled:
        rejected = _rejected_index_set(validate_fn(assembled))
        if rejected:
            assembled = drop_rejected(assembled, rejected)

    return assembled, remaining, det_added
