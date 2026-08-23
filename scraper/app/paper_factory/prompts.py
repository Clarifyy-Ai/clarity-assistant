"""Exam-aware MCQ generation prompts.

The rules here are deliberately aligned with the deterministic validators in
`app.document_intelligence.question_validators` so the model is told up front not to
produce the shapes we would reject (media references without media, answer leakage,
fewer than four options).
"""
from __future__ import annotations

import json
from typing import Sequence

from app.paper_factory.models import ExamContext, GenerationSlot

_EXAM_PROFILES: dict[str, dict[str, str]] = {
    "UPSC CSE": {
        "pattern": "UPSC Civil Services Prelims GS Paper I — conceptual, elimination-driven MCQs",
        "focus": "polity, economy, environment, history, geography and current affairs depth",
        "style": (
            "Favour multi-statement formats ('Consider the following statements... "
            "Which of the statements given above is/are correct?'), assertion-reason, "
            "and match-the-following rendered fully in text."
        ),
    },
    "SSC Exams (CGL/CHSL)": {
        "pattern": "SSC CGL/CHSL Tier I — speed-focused aptitude and static awareness",
        "focus": "arithmetic shortcuts, reasoning puzzles, grammar accuracy and static GK",
        "style": (
            "Keep stems short and computation clean enough to solve in under 60 seconds. "
            "Numeric answers must be exact, not approximations."
        ),
    },
    "Banking (IBPS/SBI/RBI)": {
        "pattern": "IBPS/SBI Prelims — reasoning, quantitative aptitude, English and banking awareness",
        "focus": "data interpretation, seating arrangement, simplification and financial awareness",
        "style": (
            "Use self-contained puzzles: state every constraint inside the stem so the "
            "question is solvable without any external set."
        ),
    },
    "RRB NTPC": {
        "pattern": "RRB NTPC CBT — general awareness, mathematics and general intelligence",
        "focus": "railway and national GK, arithmetic, coding-decoding and current events",
        "style": "Plain factual and single-step computational questions.",
    },
    "JEE Main": {
        "pattern": "JEE Main — Physics, Chemistry and Mathematics MCQs",
        "focus": "multi-step numericals, NCERT-aligned concepts and unit consistency",
        "style": "Show units in options; keep numeric answers dimensionally consistent.",
    },
    "NEET UG": {
        "pattern": "NEET UG — Biology-heavy with Physics and Chemistry",
        "focus": "NCERT lines, clinical application and assertion-reason reasoning",
        "style": "Anchor facts to NCERT terminology.",
    },
}

_DEFAULT_PROFILE = {
    "pattern": "Indian government recruitment examination MCQs",
    "focus": "syllabus-aligned conceptual and application questions",
    "style": "Self-contained, unambiguous single-correct MCQs.",
}

_SECTION_HINTS: dict[str, str] = {
    "reasoning": (
        "Logical reasoning: every puzzle must be fully specified in the stem and have "
        "exactly one deducible answer."
    ),
    "quant": (
        "Quantitative aptitude: verify the arithmetic yourself before writing options. "
        "Distractors must be plausible near-miss values, not random numbers."
    ),
    "maths": "Mathematics: verify every computation; keep one unambiguous exact answer.",
    "awareness": (
        "General awareness: use durable, verifiable facts. Avoid anything that changes "
        "month to month unless the stem pins the date explicitly."
    ),
    "english": (
        "English language: embed any sentence, idiom or phrase being tested directly in "
        "the stem. Never refer to an unattached passage."
    ),
    "gs": "General studies: prefer analytical multi-statement items over rote recall.",
    "csat": "Aptitude and comprehension: keep all required data inside the stem.",
}

_DIFFICULTY_GUIDE = {
    "EASY": "solvable in one step by a prepared candidate; direct syllabus recall",
    "MEDIUM": "requires two or three linked steps or a non-obvious distinction",
    "HARD": "requires multi-concept linkage, careful elimination, or a longer derivation",
}

_LANGUAGE_NAMES = {
    "en": "English",
    "hi": "Hindi (Devanagari script)",
    "bn": "Bengali",
    "ta": "Tamil",
    "te": "Telugu",
    "mr": "Marathi",
    "gu": "Gujarati",
    "kn": "Kannada",
    "ml": "Malayalam",
    "pa": "Punjabi",
    "or": "Odia",
    "as": "Assamese",
    "ur": "Urdu",
}

RESPONSE_SCHEMA_EXAMPLE = {
    "questions": [
        {
            "question_text": "Full self-contained question stem.",
            "options": [
                {"label": "A", "text": "..."},
                {"label": "B", "text": "..."},
                {"label": "C", "text": "..."},
                {"label": "D", "text": "..."},
            ],
            "correct_answer": "A",
            "explanation": "Two to four sentences explaining why the answer is correct.",
            "difficulty": "MEDIUM",
            "topic": "Topic name",
            "subject": "Section name",
        }
    ]
}


def resolve_profile(profile_key: str) -> dict[str, str]:
    key = (profile_key or "").strip()
    if key in _EXAM_PROFILES:
        return _EXAM_PROFILES[key]
    lowered = key.lower()
    for candidate, profile in _EXAM_PROFILES.items():
        if candidate.lower() in lowered or lowered in candidate.lower():
            return profile
    return _DEFAULT_PROFILE


def _section_hint(section_code: str, section_name: str) -> str:
    code = (section_code or "").strip().lower()
    if code in _SECTION_HINTS:
        return _SECTION_HINTS[code]
    haystack = f"{code} {section_name}".lower()
    for key, hint in _SECTION_HINTS.items():
        if key in haystack:
            return hint
    return "Keep every question self-contained and unambiguous."


def language_name(code: str) -> str:
    return _LANGUAGE_NAMES.get((code or "en").strip().lower(), "English")


def build_generation_prompt(
    *,
    exam: ExamContext,
    slot: GenerationSlot,
    language: str,
    marks_positive: float,
    marks_negative: float,
    avoid_stems: Sequence[str] = (),
    attempt: int = 1,
) -> str:
    """Build the prompt for one section/topic/difficulty batch."""
    profile = resolve_profile(exam.profile_key)
    lang = language_name(language)

    avoid_block = ""
    if avoid_stems:
        listed = "\n".join(f"- {stem[:180]}" for stem in list(avoid_stems)[:18])
        avoid_block = (
            "\nAlready used in this paper — do NOT repeat or paraphrase any of these:\n"
            f"{listed}\n"
        )

    retry_block = ""
    if attempt > 1:
        retry_block = (
            f"\nThis is retry attempt {attempt}. Earlier candidates were rejected for "
            "being duplicates or structurally invalid. Produce clearly different "
            "questions that satisfy every rule below.\n"
        )

    negative_note = (
        f"-{marks_negative} for a wrong answer" if marks_negative > 0 else "no negative marking"
    )

    return f"""
You are an expert paper setter for the {exam.prompt_label} examination.
Generate exactly {slot.count} original single-correct multiple-choice questions.

EXAM CONTEXT
Exam: {exam.prompt_label}
Pattern: {profile["pattern"]}
Examiner focus: {profile["focus"]}
Style guidance: {profile["style"]}

THIS BATCH
Section: {slot.section_name} ({slot.section_code})
Topic: {slot.topic}
Difficulty: {slot.difficulty} — {_DIFFICULTY_GUIDE[slot.difficulty]}
Section guidance: {_section_hint(slot.section_code, slot.section_name)}
Marking: +{marks_positive} for a correct answer, {negative_note}
Language: write question_text, all options and the explanation in {lang}.
{retry_block}{avoid_block}
HARD RULES — a violation makes the question unusable
1. Exactly 4 options labelled A, B, C, D, and exactly one is correct.
2. All four options must be distinct and mutually exclusive. No "All of the above" or
   "None of the above" unless it is genuinely the correct answer.
3. The question must be fully solvable from the stem alone. Never write "refer to the
   passage", "from the given table", "in the figure above" or similar — no passage,
   table, chart, diagram or image will be attached.
4. Never reveal the answer inside the stem. Do not write "Answer: B", "(Ans: C)" or
   any equivalent marker anywhere except the correct_answer field.
5. No images, image URLs, markdown images or the phrase "Reference Image".
6. Verify all arithmetic, dates, names and units before writing the options.
   Distractors must be plausible but definitively wrong.
7. Use LaTeX between single dollar signs only where mathematics genuinely requires it.
8. Stay strictly on the topic "{slot.topic}" within the "{slot.section_name}" section.
9. Every explanation must be 2-4 sentences and teach the underlying concept.
10. Do not number the questions and do not repeat a stem you already produced.

OUTPUT
Return ONLY valid JSON matching this schema, with no markdown fences and no commentary:
{json.dumps(RESPONSE_SCHEMA_EXAMPLE, ensure_ascii=False, indent=2)}
""".strip()


def build_repair_prompt(
    *,
    exam: ExamContext,
    slot: GenerationSlot,
    language: str,
    marks_positive: float,
    marks_negative: float,
    rejection_reasons: Sequence[str],
    avoid_stems: Sequence[str] = (),
    attempt: int = 2,
) -> str:
    """Prompt for regenerating a shortfall, naming the specific failures to avoid."""
    base = build_generation_prompt(
        exam=exam,
        slot=slot,
        language=language,
        marks_positive=marks_positive,
        marks_negative=marks_negative,
        avoid_stems=avoid_stems,
        attempt=attempt,
    )
    if not rejection_reasons:
        return base
    reasons = "\n".join(f"- {reason}" for reason in list(dict.fromkeys(rejection_reasons))[:10])
    return f"{base}\n\nPREVIOUS REJECTION REASONS — fix all of these:\n{reasons}"
