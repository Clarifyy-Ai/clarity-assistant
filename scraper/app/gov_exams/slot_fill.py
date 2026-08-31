"""Slot-aware bank fill shared by the hybrid engine and PaperFactory.

Never dump leftover questions into a default section. Items are placed only
into a matching section (and, when possible, a matching topic/difficulty slot)
under remaining quota.
"""
from __future__ import annotations

import re
from collections import defaultdict
from typing import Any, Callable, Sequence

from app.gov_exams.source_priority import allowed_for_mode, map_to_legacy_source_class, normalize_source_type
from app.paper_factory.models import GenerationSlot, PaperBlueprint, PaperQuestion
from app.paper_factory.repository import BankQuestion
from app.paper_factory.validate import MIN_QUALITY_SCORE, score_assembled_question

ToPaper = Callable[[BankQuestion, str, Sequence[str]], PaperQuestion | None]


def normalize_label(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()


def strip_generated_provenance(
    *,
    generated: bool,
    source_id: str | None = None,
    source_document: str | None = None,
    source_page: Any = None,
    source_year: Any = None,
    ingestion_job_id: str | None = None,
) -> tuple[str | None, str | None, Any, Any, str | None]:
    """Generated practice must never carry official document/page/year provenance."""
    if generated:
        return None, None, None, None, None
    return source_id, source_document, source_page, source_year, ingestion_job_id


def question_matches_section(
    question: BankQuestion, blueprint: PaperBlueprint, section_code: str
) -> bool:
    section = blueprint.section_by_code(section_code)
    if section is None:
        return False
    section_name = normalize_label(section.name)
    section_code_n = normalize_label(section.code)
    topic_tokens = {normalize_label(topic) for topic in section.topics if topic}
    subject = normalize_label(question.subject)
    topic = normalize_label(question.topic)

    if subject and (subject == section_name or subject == section_code_n):
        return True
    if subject and (subject in section_name or section_name in subject):
        return True
    if topic and any(token and (token in topic or topic in token) for token in topic_tokens):
        return True
    return False


def question_matches_slot(question: BankQuestion, slot: GenerationSlot) -> bool:
    topic_q = normalize_label(question.topic)
    subject_q = normalize_label(question.subject)
    topic_s = normalize_label(slot.topic)
    topic_ok = (
        not topic_s
        or topic_s in topic_q
        or topic_q in topic_s
        or topic_s in subject_q
        or subject_q in topic_s
    )
    diff_q = str(question.difficulty or "MEDIUM").upper()
    diff_s = str(slot.difficulty or "MEDIUM").upper()
    diff_ok = (not diff_s) or diff_q == diff_s
    return topic_ok and diff_ok


def match_bank_to_sections(
    bank: Sequence[BankQuestion], blueprint: PaperBlueprint
) -> dict[str, list[BankQuestion]]:
    """Assign approved bank questions to the section they belong to."""
    buckets: dict[str, list[BankQuestion]] = {s.code: [] for s in blueprint.sections}
    used: set[str] = set()

    for section in blueprint.sections:
        for question in bank:
            if question.id in used:
                continue
            if question_matches_section(question, blueprint, section.code):
                buckets[section.code].append(question)
                used.add(question.id)

    return buckets


def paper_from_bank_item(
    item: BankQuestion,
    section_code: str,
    blueprint: PaperBlueprint,
    peers: Sequence[str],
    *,
    mode: str,
) -> PaperQuestion | None:
    """Quality-filter a bank row into a PaperQuestion, or return None."""
    section = blueprint.section_by_code(section_code)
    item_source = normalize_source_type(
        source=item.source,
        source_type=item.source_type,
        source_class="bank",
        metadata=getattr(item, "metadata", None) if isinstance(getattr(item, "metadata", None), dict) else None,
    )
    if not allowed_for_mode(mode, item_source):
        return None
    scored = score_assembled_question(
        stem=item.question_text,
        options=list(item.options),
        correct_index=item.correct_index,
        explanation=str(getattr(item, "explanation", "") or ""),
        peers=list(peers),
        source_confidence=0.7,
    )
    if scored < MIN_QUALITY_SCORE:
        return None

    generated = item_source in {"generated_practice", "ai_generated_practice"}
    source_id, source_document, source_page, source_year, ingestion_job_id = strip_generated_provenance(
        generated=generated,
        source_id=getattr(item, "source_id", None),
        source_document=getattr(item, "source_document", None),
        source_page=getattr(item, "source_page", None),
        source_year=getattr(item, "source_year", None),
        ingestion_job_id=getattr(item, "ingestion_job_id", None),
    )
    return PaperQuestion(
        question_text=item.question_text,
        options=list(item.options),
        correct_index=item.correct_index,
        section_code=section_code,
        subject=item.subject or (section.name if section else section_code),
        topic=item.topic or (section.name if section else section_code),
        difficulty=item.difficulty or "MEDIUM",
        explanation=str(getattr(item, "explanation", "") or ""),
        marks_positive=blueprint.marks_per_question,
        marks_negative=blueprint.negative_mark,
        source_class=map_to_legacy_source_class(item_source),  # type: ignore[arg-type]
        source_type=item_source if item_source in {
            "official_verified",
            "verified_public_source",
            "approved_bank",
            "generated_practice",
            "ai_generated_practice",
        } else "approved_bank",
        language=blueprint.language,
        question_id=item.id,
        quality_score=scored,
        source_id=source_id,
        source_document=source_document,
        source_page=source_page,
        source_year=source_year,
        ingestion_job_id=ingestion_job_id,
        python_generated=item_source == "generated_practice" and bool(getattr(item, "python_generated", False)),
        ai_generated=item_source == "ai_generated_practice",
        generated_practice=generated,
        question_source_type=item_source,
    )


def fill_bank_into_slots(
    shuffled: Sequence[BankQuestion],
    blueprint: PaperBlueprint,
    *,
    mode: str,
) -> tuple[dict[str, list[PaperQuestion]], list[BankQuestion]]:
    """Fill blueprint slots from a prioritized, seeded bank.

    Pass 1 matches section + topic + difficulty. Pass 2 fills remaining
    section quota with section-matched leftovers. Unplaced items stay leftovers.
    """
    used: set[str] = set()
    selected: dict[str, list[PaperQuestion]] = defaultdict(list)
    caps = {s.code: s.question_count for s in blueprint.sections}

    def remaining(code: str) -> int:
        return max(0, caps.get(code, 0) - len(selected[code]))

    def try_place(item: BankQuestion, section_code: str) -> bool:
        if item.id in used or remaining(section_code) <= 0:
            return False
        peers = [q.question_text for q in selected[section_code]]
        paper = paper_from_bank_item(item, section_code, blueprint, peers, mode=mode)
        if paper is None:
            return False
        selected[section_code].append(paper)
        used.add(item.id)
        return True

    slots = list(blueprint.slots) if blueprint.slots else []
    for slot in slots:
        need = slot.count
        for item in shuffled:
            if need <= 0 or remaining(slot.section_code) <= 0:
                break
            if item.id in used:
                continue
            if not question_matches_section(item, blueprint, slot.section_code):
                continue
            if not question_matches_slot(item, slot):
                continue
            if try_place(item, slot.section_code):
                need -= 1

    buckets = match_bank_to_sections([q for q in shuffled if q.id not in used], blueprint)
    for section in blueprint.sections:
        for item in buckets.get(section.code, []):
            if remaining(section.code) <= 0:
                break
            try_place(item, section.code)

    leftovers = [q for q in shuffled if q.id not in used]
    return selected, leftovers
