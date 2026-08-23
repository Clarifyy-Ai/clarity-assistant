"""End-to-end paper generation orchestrator.

Pipeline: resolve exam -> plan blueprint -> reuse approved bank items -> generate the
remainder with AI -> validate hard constraints -> balance answer keys -> persist.
Nothing is published unless the paper matches the blueprint exactly.
"""
from __future__ import annotations

import asyncio
import re
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Sequence

from app.core.logger import get_logger
from app.paper_factory.ai import MCQGenerator
from app.paper_factory.blueprint import (
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
from app.paper_factory.validate import CandidateValidator

log = get_logger("paper_factory.factory")

StageHook = Callable[[str], Awaitable[None] | None]

_NO_ROTATE = re.compile(r"all of the above|none of the above|both\s+\(?[a-d]\)?\s+and", re.I)


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


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()


def match_bank_to_sections(
    bank: Sequence[BankQuestion], blueprint: PaperBlueprint
) -> dict[str, list[BankQuestion]]:
    """Assign approved bank questions to the section they belong to.

    Matching is by subject, then by section topic overlap, then by section code, which
    covers the bank's inconsistent labelling without ever placing an item in a section
    it has no relationship to.
    """
    buckets: dict[str, list[BankQuestion]] = {s.code: [] for s in blueprint.sections}
    used: set[str] = set()

    for section in blueprint.sections:
        section_name = _normalize(section.name)
        section_code = _normalize(section.code)
        topic_tokens = {_normalize(topic) for topic in section.topics if topic}

        for question in bank:
            if question.id in used:
                continue
            subject = _normalize(question.subject)
            topic = _normalize(question.topic)

            matched = False
            if subject and (subject == section_name or subject == section_code):
                matched = True
            elif subject and (subject in section_name or section_name in subject):
                matched = True
            elif topic and any(
                token and (token in topic or topic in token) for token in topic_tokens
            ):
                matched = True

            if matched:
                buckets[section.code].append(question)
                used.add(question.id)

    return buckets


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
        bank_count = 0
        if request.use_bank:
            bank = await asyncio.to_thread(self.repo.load_bank_questions, exam)
            validator.seed_existing((q.question_text, q.options) for q in bank)
            buckets = match_bank_to_sections(bank, blueprint)
            for section in blueprint.sections:
                available = buckets.get(section.code, [])[: section.question_count]
                for item in available:
                    bank_selected[section.code].append(
                        PaperQuestion(
                            question_text=item.question_text,
                            options=list(item.options),
                            correct_index=item.correct_index,
                            section_code=section.code,
                            subject=item.subject or section.name,
                            topic=item.topic or section.name,
                            difficulty=item.difficulty or "MEDIUM",
                            marks_positive=blueprint.marks_per_question,
                            marks_negative=blueprint.negative_mark,
                            source_class="bank",
                            question_id=item.id,
                            quality_score=100.0 if item.is_verified else 70.0,
                        )
                    )
                bank_count += len(available)

        # ── Reduce the plan by what the bank already covers ────────────────────
        outstanding = self._subtract_bank_coverage(blueprint, bank_selected)
        needed = sum(slot.count for slot in outstanding)

        report = None
        if needed > 0:
            if not self.settings.has_ai_provider:
                raise PaperFactoryError(
                    "AI_PROVIDER_UNCONFIGURED",
                    f"{needed} questions must be generated but no AI provider is configured.",
                )
            await self._stage(on_stage, "generating_questions")
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

            if report.shortfalls:
                missing = sum(report.shortfalls.values())
                raise PaperFactoryError(
                    "GENERATION_INCOMPLETE",
                    f"Could not generate {missing} of {needed} questions after "
                    f"{self.settings.max_repair_rounds + 1} rounds. "
                    f"Top rejection reasons: {dict(report.reasons.most_common(4))}",
                    retryable=True,
                )

        # ── Assemble in section order ─────────────────────────────────────────
        await self._stage(on_stage, "validating_questions")
        questions = self._assemble(blueprint, bank_selected, report)
        balance_answer_keys(questions, blueprint.random_seed)

        errors = validate_assembled_paper(blueprint, questions)
        if errors:
            raise PaperFactoryError(
                "PAPER_VALIDATION_FAILED",
                "Assembled paper failed hard constraints: " + "; ".join(errors[:5]),
            )

        generated = [q for q in questions if q.source_class == "generated"]
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
            generated_count=len(generated),
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
