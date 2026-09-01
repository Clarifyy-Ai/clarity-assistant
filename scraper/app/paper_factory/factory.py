"""End-to-end paper generation orchestrator.

Pipeline: resolve exam -> plan blueprint -> reuse approved bank items -> leftover
and deterministic fill -> AI only for remaining slots -> validate -> persist.
Nothing is published unless the paper matches the blueprint exactly.
"""
from __future__ import annotations

import asyncio
import re
import uuid
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Sequence

from app.ai_policy import decide_ai
from app.core.logger import get_logger
from app.gov_exams.deterministic_generate import (
    PRACTICE_DISCLAIMER,
    generate_practice_variants,
)
from app.gov_exams.repair import repair_paper
from app.gov_exams.slot_fill import fill_bank_into_slots, match_bank_to_sections
from app.paper_factory.ai import MCQGenerator
from app.paper_factory.blueprint import (
    EXACT_MODES,
    build_blueprint,
    split_slots_for_batching,
    validate_assembled_paper,
)
from app.paper_factory.config import FactorySettings
from app.paper_factory.generator import generate_for_slots
from app.paper_factory.models import (
    ExamContext,
    GenerationSlot,
    PaperBlueprint,
    PaperFactoryError,
    PaperQuestion,
    PaperResult,
)
from app.paper_factory.repository import BankQuestion, PaperRepository
from app.paper_factory.validate import (
    CandidateValidator,
    MIN_QUALITY_SCORE,
    score_assembled_question,
)

log = get_logger("paper_factory.factory")

StageHook = Callable[[str], Awaitable[None] | None]

_NO_ROTATE = re.compile(r"all of the above|none of the above|both\s+\(?[a-d]\)?\s+and", re.I)

# Re-export so existing tests keep importing from factory.
__all__ = [
    "GenerationRequest",
    "PaperFactory",
    "balance_answer_keys",
    "match_bank_to_sections",
    "fill_bank_into_slots",
]


@dataclass
class GenerationRequest:
    """Everything needed to produce one paper."""

    exam_query: str
    stage: str | None = None
    mode: str = "generated_mock"
    language: str = "en"
    question_count: int | None = None
    duration_minutes: int | None = None
    random_seed: str | None = None
    user_id: str | None = None
    job_id: str | None = None
    use_bank: bool = True
    publish: bool = True
    make_questions_public: bool = False
    title: str | None = None
    allow_deterministic_fill: bool = False


def balance_answer_keys(questions: Sequence[PaperQuestion], seed: str) -> None:
    """Rotate options so correct answers spread evenly across A-D.

    Real papers do not put 56% of answers on option B, which is what the current bank
    looks like. Only generated items are rotated; bank items keep their stored key.
    """
    rotatable = [
        question
        for question in questions
        if question.source_class == "generated"
        and len(question.options) == 4
        and not any(_NO_ROTATE.search(option) for option in question.options)
    ]
    if not rotatable:
        return

    offset = sum(ord(char) for char in seed) % 4
    for index, question in enumerate(rotatable):
        desired = (index + offset) % len(question.options)
        if desired == question.correct_index:
            continue
        shift = (question.correct_index - desired) % len(question.options)
        question.options = question.options[shift:] + question.options[:shift]
        question.correct_index = desired


class PaperFactory:
    """Generates a complete, validated mock paper for a searched exam."""

    def __init__(
        self,
        settings: FactorySettings,
        repository: PaperRepository | None = None,
    ) -> None:
        self.settings = settings
        self.repo = repository or PaperRepository(settings)

    async def plan(self, request: GenerationRequest) -> PaperBlueprint:
        """Resolve the exam and build the blueprint without calling any AI provider."""
        exam = await asyncio.to_thread(
            self.repo.resolve_exam, request.exam_query, request.stage
        )
        pattern = await asyncio.to_thread(self.repo.load_pattern, exam)
        syllabus_id, syllabus_version, topics = await asyncio.to_thread(
            self.repo.load_syllabus, exam
        )
        weights = await asyncio.to_thread(self.repo.load_topic_weights, exam)

        return build_blueprint(
            exam=exam,
            pattern=pattern,
            syllabus_topics=topics,
            syllabus_version_id=syllabus_id,
            syllabus_version=syllabus_version,
            topic_weights=weights,
            language=request.language,
            mode=request.mode,
            random_seed=request.random_seed or uuid.uuid4().hex,
            custom_question_count=request.question_count,
            custom_duration=request.duration_minutes,
        )

    async def generate(
        self,
        request: GenerationRequest,
        *,
        on_stage: StageHook | None = None,
        on_progress: Callable[[int, int], Awaitable[None] | None] | None = None,
    ) -> PaperResult:
        """Run the full pipeline and return the assembled (optionally published) paper."""
        await self._stage(on_stage, "analyzing_pattern")
        blueprint = await self.plan(request)
        exam = blueprint.exam

        if request.job_id:
            await asyncio.to_thread(self.repo.save_blueprint, request.job_id, blueprint)

        await self._stage(on_stage, "planning_blueprint")
        validator = CandidateValidator()

        # ── Bank-first: reuse approved verified items where they exist ──────────
        await self._stage(on_stage, "selecting_questions")
        bank_selected: dict[str, list[PaperQuestion]] = defaultdict(list)
        leftovers: list[BankQuestion] = []
        bank_count = 0
        if request.use_bank:
            bank = await asyncio.to_thread(self.repo.load_bank_questions, exam)
            validator.seed_existing((q.question_text, q.options) for q in bank)
            bank_selected, leftovers = fill_bank_into_slots(
                bank, blueprint, mode=request.mode
            )
            bank_count = sum(len(items) for items in bank_selected.values())

        outstanding = self._subtract_bank_coverage(blueprint, bank_selected)
        needed = sum(slot.count for slot in outstanding)
        if needed > 0 and request.allow_deterministic_fill:
            await self._fill_deterministic_slots(
                blueprint,
                bank_selected,
                None,
                seed=request.random_seed or request.job_id or "gov-paper",
            )
            outstanding = self._subtract_bank_coverage(blueprint, bank_selected)
            needed = sum(slot.count for slot in outstanding)
        decision = decide_ai(
            feature="paper_factory_mcq",
            needed_count=needed,
            permitted=request.mode != "official_previous",
            provider_configured=self.settings.has_ai_provider,
            official_mode=request.mode == "official_previous",
        )

        report = None
        if needed > 0 and decision == "AI_REQUIRED":
            await self._stage(on_stage, "generating_questions")
            try:
                async with MCQGenerator(self.settings) as ai:
                    report = await generate_for_slots(
                        exam=exam,
                        blueprint=blueprint,
                        slots=outstanding,
                        generator=ai,
                        validator=validator,
                        batch_size=self.settings.batch_size,
                        max_repair_rounds=self.settings.max_repair_rounds,
                        on_progress=on_progress,
                    )
            except Exception as exc:
                log.warning(
                    "paper_factory_ai_unavailable",
                    exam=exam.code,
                    error=str(exc),
                )
                report = None

            if report is None or report.shortfalls:
                if request.allow_deterministic_fill:
                    log.info(
                        "paper_factory_ai_shortfall_deterministic_fill",
                        exam=exam.code,
                    )
                    report = await self._fill_deterministic_slots(
                        blueprint,
                        bank_selected,
                        report,
                        seed=request.random_seed or request.job_id or "gov-paper",
                    )
                else:
                    generated_so_far = (
                        0
                        if report is None
                        else sum(len(v) for v in report.accepted.values())
                    )
                    have = (blueprint.total_questions - needed) + generated_so_far
                    raise PaperFactoryError(
                        "GENERATION_INCOMPLETE",
                        f"Only {have} of {blueprint.total_questions} questions "
                        "could be assembled; deterministic fill is not permitted.",
                        retryable=True,
                    )
        elif needed > 0:
            if request.mode == "official_previous":
                raise PaperFactoryError(
                    "CONTENT_INSUFFICIENT",
                    f"{needed} official questions are missing and cannot be fabricated.",
                    retryable=False,
                )
            gemini_key = getattr(self.settings, "gemini_api_key", "") or ""
            openai_key = getattr(self.settings, "openai_api_key", "") or ""
            keys_empty = isinstance(gemini_key, str) and isinstance(openai_key, str) and not gemini_key and not openai_key
            if keys_empty and not request.allow_deterministic_fill:
                raise PaperFactoryError(
                    "AI_PROVIDER_UNCONFIGURED",
                    "No AI provider configured. Set GEMINI_API_KEY or OPENAI_API_KEY.",
                    retryable=False,
                )
            have = blueprint.total_questions - needed
            raise PaperFactoryError(
                "CONTENT_INSUFFICIENT",
                f"Only {have} of {blueprint.total_questions} bank questions "
                "are available; deterministic fill disabled.",
                retryable=False,
            )

        # ── Assemble in section order ─────────────────────────────────────────
        await self._stage(on_stage, "validating_questions")
        questions = self._assemble(blueprint, bank_selected, report)
        used_ids = {q.question_id for q in questions if q.question_id}
        leftovers = [item for item in leftovers if item.id not in used_ids]
        balance_answer_keys(questions, blueprint.random_seed)

        errors = validate_assembled_paper(blueprint, questions)
        if errors or len(questions) < blueprint.total_questions:
            questions, leftovers, _det_added = repair_paper(
                blueprint,
                questions,
                leftovers,
                mode=request.mode,
                allow_det=request.allow_deterministic_fill,
                seed=request.random_seed or request.job_id or "paper",
                max_rounds=self.settings.max_repair_rounds,
            )
            balance_answer_keys(questions, blueprint.random_seed)
            errors = validate_assembled_paper(blueprint, questions)
            bank_count = sum(
                1
                for q in questions
                if q.source_class in {"bank", "previous_year"} and not q.generated_practice
            )

        if errors:
            shortfall = any(
                "Exact question count" in e or e.startswith("Section ") for e in errors
            )
            if shortfall and request.mode in EXACT_MODES:
                raise PaperFactoryError(
                    "CONTENT_INSUFFICIENT",
                    "Assembled paper failed hard constraints after repair: "
                    + "; ".join(errors[:5]),
                    retryable=False,
                )
            raise PaperFactoryError(
                "PAPER_VALIDATION_FAILED",
                "Assembled paper failed hard constraints: " + "; ".join(errors[:5]),
            )

        generated = [
            q for q in questions if q.source_class in ("generated", "deterministic")
        ]
        ai_generated = [q for q in generated if q.source_class == "generated"]
        quality = (
            round(sum(q.quality_score for q in questions) / len(questions), 2)
            if questions
            else 0.0
        )
        result = PaperResult(
            blueprint=blueprint,
            questions=questions,
            job_id=request.job_id,
            quality_score=quality,
            generated_count=len(ai_generated),
            bank_count=bank_count,
            ai_calls=report.ai_calls if report else 0,
            rejected_count=report.rejected if report else 0,
            rejection_reasons=dict(report.reasons) if report else {},
        )

        if not request.publish:
            return result

        if not request.user_id:
            raise PaperFactoryError(
                "USER_REQUIRED", "A user id is required to publish a paper."
            )

        await self._stage(on_stage, "assembling")
        if generated:
            ids = await asyncio.to_thread(
                self.repo.insert_questions,
                generated,
                exam=exam,
                language=blueprint.language,
                blueprint=blueprint,
                make_public=request.make_questions_public,
            )
            for question, question_id in zip(generated, ids):
                question.question_id = question_id

        paper_id, mock_test_id = await asyncio.to_thread(
            self.repo.publish_paper,
            blueprint=blueprint,
            questions=questions,
            user_id=request.user_id,
            job_id=request.job_id,
            quality_score=quality,
            provenance=result.provenance_json(),
            title=request.title,
        )
        result.paper_id = paper_id
        result.mock_test_id = mock_test_id

        log.info(
            "paper_factory_completed",
            exam=exam.code,
            questions=len(questions),
            bank=bank_count,
            generated=len(generated),
            ai_calls=result.ai_calls,
            rejected=result.rejected_count,
            quality=quality,
            paper_id=paper_id,
        )
        return result

    async def _fill_deterministic_slots(
        self,
        blueprint: PaperBlueprint,
        bank_selected: dict[str, list[PaperQuestion]],
        report: Any,
        *,
        seed: str,
    ) -> Any:
        """Add validated, explicitly practice-labelled variants for open slots."""
        for section in blueprint.sections:
            current = len(bank_selected.get(section.code, []))
            if report is not None:
                current += sum(
                    len(items)
                    for key, items in report.accepted.items()
                    if key.split("::", 1)[0] == section.code
                )
            needed = max(0, section.question_count - current)
            if needed <= 0:
                continue

            variants = generate_practice_variants(
                count=needed,
                seed=f"{seed}:{section.code}",
                section_code=section.code,
                section_name=section.name,
            )
            for variant in variants:
                score = score_assembled_question(
                    stem=variant.question_text,
                    options=list(variant.options),
                    correct_index=variant.correct_index,
                    explanation=variant.explanation,
                )
                if score < MIN_QUALITY_SCORE:
                    continue
                bank_selected[section.code].append(
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
        return report

    # ── internals ─────────────────────────────────────────────────────────────

    @staticmethod
    def _subtract_bank_coverage(
        blueprint: PaperBlueprint, bank_selected: dict[str, list[PaperQuestion]]
    ) -> list[GenerationSlot]:
        """Shrink each section's generation slots by the number of bank items used."""
        outstanding: list[GenerationSlot] = []
        for section in blueprint.sections:
            budget = section.question_count - len(bank_selected.get(section.code, []))
            if budget <= 0:
                continue
            section_slots = [
                slot for slot in blueprint.slots if slot.section_code == section.code
            ]
            for slot in section_slots:
                if budget <= 0:
                    break
                take = min(slot.count, budget)
                outstanding.append(
                    GenerationSlot(
                        section_code=slot.section_code,
                        section_name=slot.section_name,
                        topic=slot.topic,
                        difficulty=slot.difficulty,
                        count=take,
                    )
                )
                budget -= take
        return outstanding

    @staticmethod
    def _assemble(
        blueprint: PaperBlueprint,
        bank_selected: dict[str, list[PaperQuestion]],
        report: Any,
    ) -> list[PaperQuestion]:
        by_section: dict[str, list[PaperQuestion]] = defaultdict(list)
        for section_code, items in bank_selected.items():
            by_section[section_code].extend(items)
        if report is not None:
            for key, items in report.accepted.items():
                section_code = key.split("::", 1)[0]
                by_section[section_code].extend(items)

        ordered: list[PaperQuestion] = []
        for section in sorted(blueprint.sections, key=lambda s: s.sort_order):
            ordered.extend(by_section.get(section.code, [])[: section.question_count])
        return ordered

    @staticmethod
    async def _stage(hook: StageHook | None, stage: str) -> None:
        if hook is None:
            return
        result = hook(stage)
        if asyncio.iscoroutine(result):
            await result
