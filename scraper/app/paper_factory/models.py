"""Typed models for the government exam paper factory.

Mirrors the Edge contracts in `supabase/functions/_shared/govBlueprint.ts` so a paper
produced by Python is indistinguishable from one produced by the Deno assembler.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from app.shared.algorithm_catalog import (
    dedup_algorithm_version,
    quality_algorithm_version,
    paper_blueprint_version,
)

Difficulty = Literal["EASY", "MEDIUM", "HARD"]
DIFFICULTIES: tuple[Difficulty, ...] = ("EASY", "MEDIUM", "HARD")
QuestionSourceType = Literal[
    "official_verified",
    "verified_public_source",
    "approved_bank",
    "generated_practice",
    "ai_generated_practice",
]

GENERATION_POLICY_VERSION = paper_blueprint_version()
ALGORITHM_VERSION = paper_blueprint_version()

AI_PAPER_DISCLAIMER = (
    "AI-generated practice paper based on the selected syllabus, pattern, and "
    "historical topic distribution. This is not an official or leaked examination paper."
)


@dataclass(frozen=True)
class ExamContext:
    """Resolved exam + stage identity used for prompting and bank lookups."""

    exam_id: str
    code: str
    name: str
    legacy_exam_type: str | None = None
    family: str | None = None
    stage_id: str | None = None
    stage_code: str | None = None
    stage_name: str | None = None
    bank_type_keys: tuple[str, ...] = ()

    @property
    def prompt_label(self) -> str:
        stage = f" — {self.stage_name}" if self.stage_name else ""
        return f"{self.name}{stage}"

    @property
    def profile_key(self) -> str:
        """Key used to look up the exam style profile."""
        return self.legacy_exam_type or self.name or self.code


@dataclass(frozen=True)
class PatternSection:
    code: str
    name: str
    question_count: int
    marks: float
    sort_order: int = 0


@dataclass(frozen=True)
class PatternVersion:
    id: str
    version: str
    total_questions: int
    total_marks: float
    duration_minutes: int
    negative_mark: float
    marks_per_question: float
    sections: tuple[PatternSection, ...]
    languages: tuple[str, ...] = ("en",)


@dataclass(frozen=True)
class GenerationSlot:
    """One AI generation unit: `count` questions for a section/topic/difficulty."""

    section_code: str
    section_name: str
    topic: str
    difficulty: Difficulty
    count: int

    @property
    def key(self) -> str:
        return f"{self.section_code}::{self.topic}::{self.difficulty}"


@dataclass(frozen=True)
class SectionBlueprint:
    code: str
    name: str
    question_count: int
    marks: float
    sort_order: int
    topics: tuple[str, ...]
    difficulty_counts: tuple[tuple[str, int], ...]
    topic_counts: tuple[tuple[str, int], ...]

    def to_json(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "name": self.name,
            "question_count": self.question_count,
            "marks": self.marks,
            "sort_order": self.sort_order,
            "topics": list(self.topics),
            "difficulty_counts": dict(self.difficulty_counts),
            "topic_counts": dict(self.topic_counts),
        }


@dataclass
class PaperBlueprint:
    """Full generation plan for one paper."""

    exam: ExamContext
    pattern_version_id: str
    pattern_version: str
    syllabus_version_id: str | None
    syllabus_version: str | None
    language: str
    total_questions: int
    total_marks: float
    duration_minutes: int
    negative_mark: float
    marks_per_question: float
    sections: tuple[SectionBlueprint, ...]
    slots: tuple[GenerationSlot, ...]
    mode: str
    paper_class: str
    random_seed: str
    topic_weights: dict[str, float] = field(default_factory=dict)
    source_years: tuple[int, ...] = ()

    @property
    def label(self) -> str:
        if self.paper_class == "ai_generated":
            return AI_PAPER_DISCLAIMER
        if self.paper_class == "custom_practice":
            return "Custom Practice Set — not a full official exam simulation."
        return "Previous-year style practice assembled from approved bank items with provenance."

    def section_by_code(self, code: str) -> SectionBlueprint | None:
        for section in self.sections:
            if section.code == code:
                return section
        return None

    def to_json(self) -> dict[str, Any]:
        return {
            "exam_id": self.exam.exam_id,
            "exam_code": self.exam.code,
            "exam_name": self.exam.name,
            "stage_id": self.exam.stage_id,
            "stage_name": self.exam.stage_name,
            "pattern_version_id": self.pattern_version_id,
            "pattern_version": self.pattern_version,
            "syllabus_version_id": self.syllabus_version_id,
            "syllabus_version": self.syllabus_version,
            "language": self.language,
            "total_questions": self.total_questions,
            "total_marks": self.total_marks,
            "duration_minutes": self.duration_minutes,
            "negative_mark": self.negative_mark,
            "marks_per_question": self.marks_per_question,
            "sections": [s.to_json() for s in self.sections],
            "slots": [
                {
                    "section_code": s.section_code,
                    "topic": s.topic,
                    "difficulty": s.difficulty,
                    "count": s.count,
                }
                for s in self.slots
            ],
            "mode": self.mode,
            "paper_class": self.paper_class,
            "source_years": list(self.source_years),
            "topic_weights": self.topic_weights,
            "random_seed": self.random_seed,
            "generation_policy_version": GENERATION_POLICY_VERSION,
            "algorithm_version": ALGORITHM_VERSION,
            "generator": "python_paper_factory",
            "hard_constraints_ok": True,
            "label": self.label,
        }


@dataclass
class PaperQuestion:
    """A question placed on the paper, from the bank or freshly generated."""

    question_text: str
    options: list[str]
    correct_index: int
    section_code: str
    subject: str
    topic: str
    difficulty: str
    explanation: str = ""
    marks_positive: float = 1.0
    marks_negative: float = 0.0
    source_class: Literal["bank", "generated", "deterministic", "previous_year"] = "generated"
    source_type: QuestionSourceType = "generated_practice"
    language: str = "en"
    question_id: str | None = None
    quality_score: float = 0.0
    source_id: str | None = None
    source_document: str | None = None
    source_page: Any = None
    source_year: Any = None
    ingestion_job_id: str | None = None
    python_generated: bool = False
    ai_generated: bool = False
    generated_practice: bool = False
    question_source_type: str | None = None

    @property
    def correct_answer_letter(self) -> str:
        return chr(65 + self.correct_index)

    def options_json(self) -> list[dict[str, str]]:
        return [
            {"label": chr(65 + idx), "text": text}
            for idx, text in enumerate(self.options)
        ]


@dataclass
class PaperResult:
    """Outcome of a full generation run."""

    blueprint: PaperBlueprint
    questions: list[PaperQuestion]
    paper_id: str | None = None
    mock_test_id: str | None = None
    job_id: str | None = None
    quality_score: float = 0.0
    generated_count: int = 0
    bank_count: int = 0
    ai_calls: int = 0
    rejected_count: int = 0
    rejection_reasons: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    @property
    def is_complete(self) -> bool:
        return len(self.questions) == self.blueprint.total_questions

    def provenance_json(self) -> dict[str, Any]:
        from app.gov_exams.source_priority import normalize_source_type, summarize_source_mix

        deterministic_questions = sum(
            1
            for question in self.questions
            if question.source_class == "deterministic" or question.python_generated
        )
        types: list[str] = []
        for question in self.questions:
            types.append(
                str(
                    question.question_source_type
                    or question.source_type
                    or normalize_source_type(source_class=question.source_class)
                )
            )
        source_mix = summarize_source_mix(types)
        return {
            "generator": "python_paper_factory",
            "generation_policy_version": GENERATION_POLICY_VERSION,
            "algorithm_version": ALGORITHM_VERSION,
            "quality_algorithm_version": quality_algorithm_version(),
            "dedup_algorithm_version": dedup_algorithm_version(),
            "paper_blueprint_version": paper_blueprint_version(),
            "bank_questions": self.bank_count,
            "ai_questions": self.generated_count,
            "deterministic_questions": deterministic_questions,
            "source_mix": source_mix,
            "ai_calls": self.ai_calls,
            "rejected_candidates": self.rejected_count,
            "rejection_reasons": self.rejection_reasons,
            "quality_score": self.quality_score,
            "warnings": self.warnings,
            "disclaimer": AI_PAPER_DISCLAIMER,
        }


class PaperFactoryError(Exception):
    """Structured failure with a stable machine code for the job row."""

    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
