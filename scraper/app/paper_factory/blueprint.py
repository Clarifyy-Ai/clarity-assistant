"""Blueprint planning: pattern -> section quotas -> topic/difficulty generation slots.

Section scaling mirrors `buildBlueprint` in `supabase/functions/_shared/govBlueprint.ts`
so Python and Deno produce identical paper shapes for the same input.
"""
from __future__ import annotations

import random
import re
from collections import OrderedDict
from typing import Any, Iterable, Mapping, Sequence

from app.paper_factory.models import (
    DIFFICULTIES,
    Difficulty,
    ExamContext,
    GenerationSlot,
    PaperBlueprint,
    PaperFactoryError,
    PaperQuestion,
    PatternSection,
    PatternVersion,
    SectionBlueprint,
)
from app.document_intelligence.deduplication import QuestionDeduplicationEngine

# Difficulty distribution by exam profile, expressed as percentages.
EXAM_DIFFICULTY_MIX: dict[str, dict[Difficulty, int]] = {
    "UPSC CSE": {"EASY": 20, "MEDIUM": 45, "HARD": 35},
    "SSC Exams (CGL/CHSL)": {"EASY": 35, "MEDIUM": 45, "HARD": 20},
    "Banking (IBPS/SBI/RBI)": {"EASY": 30, "MEDIUM": 50, "HARD": 20},
    "RRB NTPC": {"EASY": 40, "MEDIUM": 45, "HARD": 15},
    "JEE Main": {"EASY": 20, "MEDIUM": 45, "HARD": 35},
    "JEE Advanced": {"EASY": 10, "MEDIUM": 40, "HARD": 50},
    "NEET UG": {"EASY": 30, "MEDIUM": 45, "HARD": 25},
}
DEFAULT_DIFFICULTY_MIX: dict[Difficulty, int] = {"EASY": 30, "MEDIUM": 50, "HARD": 20}
FAMILY_DIFFICULTY_MIX: dict[str, dict[Difficulty, int]] = {
    "ssc": {"EASY": 35, "MEDIUM": 45, "HARD": 20},
    "banking": {"EASY": 30, "MEDIUM": 50, "HARD": 20},
    "upsc": {"EASY": 20, "MEDIUM": 45, "HARD": 35},
    "railways": {"EASY": 40, "MEDIUM": 45, "HARD": 15},
    "academic": {"EASY": 20, "MEDIUM": 45, "HARD": 35},
    "state_psc": {"EASY": 30, "MEDIUM": 50, "HARD": 20},
    "professional": {"EASY": 30, "MEDIUM": 50, "HARD": 20},
    "defence": {"EASY": 35, "MEDIUM": 45, "HARD": 20},
    "teaching": {"EASY": 35, "MEDIUM": 50, "HARD": 15},
}


def difficulty_mix_for(profile_key: str, family: str | None = None) -> dict[Difficulty, int]:
    key = (profile_key or "").strip()
    if key in EXAM_DIFFICULTY_MIX:
        return EXAM_DIFFICULTY_MIX[key]
    lowered = key.lower()
    for candidate, mix in EXAM_DIFFICULTY_MIX.items():
        if candidate.lower() in lowered or lowered in candidate.lower():
            return mix
    fam = (family or "").strip().lower()
    if fam in FAMILY_DIFFICULTY_MIX:
        return FAMILY_DIFFICULTY_MIX[fam]
    return DEFAULT_DIFFICULTY_MIX


VALID_MODES = ("official_previous", "generated_mock", "custom_mock", "adaptive")
EXACT_MODES = ("official_previous", "generated_mock")


def humanize(slug: str) -> str:
    """`coding_decoding` -> `Coding Decoding`; already-prose values pass through."""
    text = str(slug or "").strip()
    if not text:
        return ""
    if re.search(r"[a-z][A-Z]", text):
        text = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", text)
    text = text.replace("_", " ").replace("-", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return " ".join(word if word.isupper() else word.capitalize() for word in text.split())


def allocate(total: int, weights: Sequence[float], min_each: int = 0) -> list[int]:
    """Distribute `total` across `weights` using the largest-remainder method.

    `min_each` is honoured only when the total is large enough to cover it, which keeps
    topic coverage broad without ever breaking the exact-total guarantee.
    """
    n = len(weights)
    if n == 0:
        return []
    if total <= 0:
        return [0] * n

    floor_each = min_each if total >= min_each * n else 0
    remaining = total - floor_each * n
    safe_weights = [max(0.0, float(w)) for w in weights]
    weight_sum = sum(safe_weights)
    if weight_sum <= 0:
        safe_weights = [1.0] * n
        weight_sum = float(n)

    exact = [w / weight_sum * remaining for w in safe_weights]
    counts = [floor_each + int(value) for value in exact]
    assigned = sum(counts)
    leftover = total - assigned
    if leftover > 0:
        order = sorted(range(n), key=lambda i: (-(exact[i] - int(exact[i])), i))
        for idx in range(leftover):
            counts[order[idx % n]] += 1
    return counts


def scale_sections(
    sections: Sequence[PatternSection], total_questions: int
) -> list[PatternSection]:
    """Proportionally rescale section quotas so they sum to exactly `total_questions`."""
    if not sections:
        return []
    pattern_total = sum(s.question_count for s in sections)
    if pattern_total <= 0:
        raise PaperFactoryError(
            "PATTERN_INVALID", "Pattern sections have no question counts."
        )

    if pattern_total == total_questions:
        counts = [s.question_count for s in sections]
    else:
        counts = allocate(
            total_questions,
            [s.question_count for s in sections],
            min_each=1,
        )

    return [
        PatternSection(
            code=section.code,
            name=section.name,
            question_count=count,
            marks=section.marks,
            sort_order=section.sort_order,
        )
        for section, count in zip(sections, counts)
    ]


def _section_topics(
    section: PatternSection, syllabus_topics: Mapping[str, Sequence[str]]
) -> tuple[str, ...]:
    raw = (
        syllabus_topics.get(section.code)
        or syllabus_topics.get(section.code.lower())
        or syllabus_topics.get(section.name)
        or ()
    )
    topics = [humanize(t) for t in raw if str(t or "").strip()]
    deduped = list(OrderedDict.fromkeys(topics))
    return tuple(deduped) if deduped else (humanize(section.name) or section.code,)


def build_blueprint(
    *,
    exam: ExamContext,
    pattern: PatternVersion,
    syllabus_topics: Mapping[str, Sequence[str]] | None = None,
    syllabus_version_id: str | None = None,
    syllabus_version: str | None = None,
    topic_weights: Mapping[str, float] | None = None,
    language: str = "en",
    mode: str = "generated_mock",
    random_seed: str = "seed",
    custom_question_count: int | None = None,
    custom_duration: int | None = None,
    source_years: Iterable[int] = (),
) -> PaperBlueprint:
    """Plan a full paper: section quotas, topic spread, difficulty mix, generation slots."""
    if mode not in VALID_MODES:
        raise PaperFactoryError("INVALID_MODE", f"Unsupported generation mode: {mode}")
    if not pattern.sections:
        raise PaperFactoryError(
            "PATTERN_INVALID", "Approved pattern has no sections defined."
        )

    customizing = (
        mode in ("custom_mock", "adaptive")
        or (
            custom_question_count is not None
            and custom_question_count != pattern.total_questions
        )
        or (custom_duration is not None and custom_duration != pattern.duration_minutes)
    )
    total_questions = (
        min(pattern.total_questions, max(5, custom_question_count or pattern.total_questions))
        if customizing
        else pattern.total_questions
    )

    scaled = scale_sections(pattern.sections, total_questions)
    topics_map = syllabus_topics or {}
    weights = {str(k).lower(): float(v) for k, v in (topic_weights or {}).items()}
    mix = difficulty_mix_for(exam.profile_key, exam.family)
    rng = random.Random(f"{random_seed}::{exam.exam_id}::{total_questions}")

    section_blueprints: list[SectionBlueprint] = []
    slots: list[GenerationSlot] = []

    for section in sorted(scaled, key=lambda s: s.sort_order):
        topics = _section_topics(section, topics_map)
        topic_weight_values = [weights.get(t.lower(), 1.0) for t in topics]
        topic_counts = allocate(section.question_count, topic_weight_values, min_each=1)

        difficulty_counts = allocate(
            section.question_count, [mix[d] for d in DIFFICULTIES], min_each=0
        )
        difficulty_pool: list[Difficulty] = []
        for difficulty, count in zip(DIFFICULTIES, difficulty_counts):
            difficulty_pool.extend([difficulty] * count)
        rng.shuffle(difficulty_pool)

        grouped: "OrderedDict[tuple[str, Difficulty], int]" = OrderedDict()
        cursor = 0
        for topic, count in zip(topics, topic_counts):
            for _ in range(count):
                difficulty = difficulty_pool[cursor]
                cursor += 1
                key = (topic, difficulty)
                grouped[key] = grouped.get(key, 0) + 1

        for (topic, difficulty), count in grouped.items():
            slots.append(
                GenerationSlot(
                    section_code=section.code,
                    section_name=section.name,
                    topic=topic,
                    difficulty=difficulty,
                    count=count,
                )
            )

        section_blueprints.append(
            SectionBlueprint(
                code=section.code,
                name=section.name,
                question_count=section.question_count,
                marks=float(section.marks),
                sort_order=section.sort_order,
                topics=topics,
                difficulty_counts=tuple(
                    (d, c) for d, c in zip(DIFFICULTIES, difficulty_counts)
                ),
                topic_counts=tuple(zip(topics, topic_counts)),
            )
        )

    paper_class = (
        "official_previous"
        if mode == "official_previous"
        else "custom_practice"
        if customizing
        else "ai_generated"
    )

    blueprint = PaperBlueprint(
        exam=exam,
        pattern_version_id=pattern.id,
        pattern_version=pattern.version,
        syllabus_version_id=syllabus_version_id,
        syllabus_version=syllabus_version,
        language=language or "en",
        total_questions=total_questions,
        total_marks=(
            total_questions * pattern.marks_per_question
            if customizing
            else float(pattern.total_marks)
        ),
        duration_minutes=int(custom_duration or pattern.duration_minutes),
        negative_mark=float(pattern.negative_mark),
        marks_per_question=float(pattern.marks_per_question),
        sections=tuple(section_blueprints),
        slots=tuple(slots),
        mode=mode,
        paper_class=paper_class,
        random_seed=random_seed,
        topic_weights=dict(weights),
        source_years=tuple(source_years),
    )

    errors = validate_blueprint(blueprint)
    if errors:
        raise PaperFactoryError(
            "BLUEPRINT_INVALID", "Blueprint failed hard constraints: " + "; ".join(errors)
        )
    return blueprint


def validate_blueprint(blueprint: PaperBlueprint) -> list[str]:
    """Hard constraints that must hold before any AI call is made."""
    errors: list[str] = []

    section_sum = sum(s.question_count for s in blueprint.sections)
    if section_sum != blueprint.total_questions:
        errors.append(
            f"Section question sum {section_sum} != total {blueprint.total_questions}"
        )

    slot_sum = sum(s.count for s in blueprint.slots)
    if slot_sum != blueprint.total_questions:
        errors.append(f"Slot sum {slot_sum} != total {blueprint.total_questions}")

    if blueprint.total_questions < 1:
        errors.append("total_questions must be >= 1")
    if blueprint.duration_minutes < 1:
        errors.append("duration_minutes must be >= 1")
    if blueprint.marks_per_question <= 0:
        errors.append("marks_per_question must be > 0")
    if blueprint.negative_mark < 0:
        errors.append("negative_mark cannot be negative")
    if blueprint.negative_mark > blueprint.marks_per_question:
        errors.append("negative_mark cannot exceed marks_per_question")
    if not blueprint.language.strip():
        errors.append("language must be specified")

    for section in blueprint.sections:
        if section.question_count < 0:
            errors.append(f"Section {section.code} has a negative question count")
        topic_sum = sum(count for _, count in section.topic_counts)
        if topic_sum != section.question_count:
            errors.append(
                f"Section {section.code} topic counts {topic_sum} != {section.question_count}"
            )
        difficulty_sum = sum(count for _, count in section.difficulty_counts)
        if difficulty_sum != section.question_count:
            errors.append(
                f"Section {section.code} difficulty counts {difficulty_sum} != {section.question_count}"
            )

    return errors


def validate_assembled_paper(
    blueprint: PaperBlueprint, questions: Sequence[PaperQuestion]
) -> list[str]:
    """Hard constraints that must hold before the paper is published."""
    errors: list[str] = []

    if len(questions) != blueprint.total_questions:
        errors.append(
            f"Exact question count failed: got {len(questions)}, "
            f"expected {blueprint.total_questions}"
        )

    expected_marks = blueprint.total_questions * blueprint.marks_per_question
    if abs(blueprint.total_marks - expected_marks) > 0.001:
        errors.append(
            f"Total marks {blueprint.total_marks} != calculated {expected_marks}"
        )

    per_section: dict[str, int] = {}
    seen_stems: set[str] = set()
    seen_ids: set[str] = set()
    prior_questions: list[PaperQuestion] = []
    dedup = QuestionDeduplicationEngine()
    authentic_sources = {
        "official_verified",
        "verified_public_source",
        "approved_bank",
        "internal_question_bank",
        "admin_uploaded",
    }
    rejected_generated = {
        "generated_practice",
        "ai_generated_practice",
        "generated",
        "deterministic",
    }
    has_deterministic_practice = any(
        question.source_class == "deterministic" for question in questions
    )
    for index, question in enumerate(questions, start=1):
        per_section[question.section_code] = per_section.get(question.section_code, 0) + 1

        if len(question.options) < 2:
            errors.append(f"Question {index} has fewer than 2 options")
        if not 0 <= question.correct_index < len(question.options):
            errors.append(f"Question {index} has an out-of-range correct answer")
        if not question.question_text.strip():
            errors.append(f"Question {index} has an empty stem")
        if question.question_id and question.question_id in seen_ids:
            errors.append(f"Duplicate question id at position {index}")
        if question.question_id:
            seen_ids.add(question.question_id)
        if question.language.lower() != blueprint.language.lower():
            errors.append(f"Question {index} language does not match paper")
        if question.marks_positive != blueprint.marks_per_question:
            errors.append(f"Question {index} positive marks do not match blueprint")
        if question.marks_negative != blueprint.negative_mark:
            errors.append(f"Question {index} negative marks do not match blueprint")
        if question.difficulty not in DIFFICULTIES:
            errors.append(f"Question {index} has invalid difficulty")
        if not question.topic.strip():
            errors.append(f"Question {index} has no topic")
        if blueprint.mode == "official_previous":
            st = (question.source_type or "").strip().lower()
            if (
                not st
                or st not in authentic_sources
                or st in rejected_generated
                or "generated" in st
                or st.startswith("ai_")
            ):
                errors.append(f"Question {index} has generated provenance in official mode")

        normalized = re.sub(r"\s+", " ", question.question_text.strip().lower())
        if len(normalized) > 10:
            if normalized in seen_stems:
                errors.append(f"Duplicate question stem at position {index}")
            seen_stems.add(normalized)
        for previous in prior_questions:
            decision = dedup.evaluate_pair(
                question.question_text,
                question.options,
                previous.question_text,
                previous.options,
            )["decision"]
            if decision in {"exact_duplicate", "near_duplicate"} or (
                decision == "template_clone"
                and question.source_class != "deterministic"
                and previous.source_class != "deterministic"
                and not has_deterministic_practice
            ):
                errors.append(f"{decision} at position {index}")
                break
        prior_questions.append(question)

    # Exact full-paper modes must hit section quotas + topic coverage.
    # Custom/adaptive practice is bank-sampled to a smaller N and must not
    # fail just because syllabus topic labels don't match slot names.
    exact_mode = blueprint.mode in EXACT_MODES
    for section in blueprint.sections:
        actual = per_section.get(section.code, 0)
        if exact_mode and actual != section.question_count:
            errors.append(
                f"Section {section.code} has {actual} questions, "
                f"expected {section.question_count}"
            )
        if not exact_mode:
            continue
        expected_topics = {
            topic.strip().lower()
            for topic, count in section.topic_counts
            if count > 0
        }
        actual_topics = {
            q.topic.strip().lower()
            for q in questions
            if q.section_code == section.code and q.topic.strip()
        }
        if expected_topics and not expected_topics.issubset(actual_topics):
            errors.append(f"Section {section.code} is missing required topic coverage")

    if not exact_mode and blueprint.sections:
        # Soft check: every question should land in a known section when tagged.
        known = {s.code for s in blueprint.sections}
        unknown = sorted(
            code for code in per_section if code and code not in known
        )
        if unknown:
            errors.append(
                "Unexpected section codes in custom paper: " + ", ".join(unknown[:5])
            )

    return errors


def split_slots_for_batching(
    slots: Iterable[GenerationSlot], batch_size: int
) -> list[GenerationSlot]:
    """Break oversized slots into AI-call-sized chunks."""
    size = max(1, batch_size)
    batches: list[GenerationSlot] = []
    for slot in slots:
        remaining = slot.count
        while remaining > 0:
            take = min(size, remaining)
            batches.append(
                GenerationSlot(
                    section_code=slot.section_code,
                    section_name=slot.section_name,
                    topic=slot.topic,
                    difficulty=slot.difficulty,
                    count=take,
                )
            )
            remaining -= take
    return batches


def blueprint_summary(blueprint: PaperBlueprint) -> dict[str, Any]:
    """Compact human-readable plan summary for CLI output and logs."""
    return {
        "exam": blueprint.exam.prompt_label,
        "total_questions": blueprint.total_questions,
        "total_marks": blueprint.total_marks,
        "duration_minutes": blueprint.duration_minutes,
        "marking": f"+{blueprint.marks_per_question} / -{blueprint.negative_mark}",
        "paper_class": blueprint.paper_class,
        "sections": [
            {
                "code": s.code,
                "name": s.name,
                "questions": s.question_count,
                "topics": len(s.topics),
                "difficulty": dict(s.difficulty_counts),
            }
            for s in blueprint.sections
        ],
        "ai_batches": len(blueprint.slots),
    }
