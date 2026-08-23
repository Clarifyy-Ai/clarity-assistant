"""Hybrid job processor: availability → selection → optional AI → Python fallback."""
from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from app.gov_exams.availability import MIN_CUSTOM_PRACTICE, load_eligible_bank
from app.gov_exams.deterministic_generate import (
    PRACTICE_DISCLAIMER,
    generate_practice_variants,
)
from app.gov_exams.observability import gov_exam_log
from app.gov_exams.schemas import ProcessJobResponse
from app.gov_exams.selection import seeded_shuffle
from app.paper_factory.ai import MCQGenerator
from app.paper_factory.blueprint import validate_assembled_paper
from app.paper_factory.config import FactorySettings
from app.paper_factory.factory import (
    GenerationRequest,
    PaperFactory,
    balance_answer_keys,
    match_bank_to_sections,
)
from app.paper_factory.generator import generate_for_slots
from app.paper_factory.models import PaperFactoryError, PaperQuestion, PaperResult
from app.paper_factory.repository import BankQuestion, PaperRepository, _uuid_or_none
from app.paper_factory.validate import CandidateValidator

AI_ELIGIBLE_MODES = frozenset({"generated_mock", "custom_mock", "adaptive"})
EXACT_MODES = frozenset({"official_previous", "generated_mock"})


def _request_json(job: dict[str, Any]) -> dict[str, Any]:
    payload = job.get("request_json") or {}
    return payload if isinstance(payload, dict) else {}


def _allow_ai_fill(job: dict[str, Any], mode: str, *, has_provider: bool) -> bool:
    if mode == "official_previous" or not has_provider:
        return False
    payload = _request_json(job)
    if payload.get("skipAiFill") is True or payload.get("allowAiFill") is False:
        return False
    if payload.get("allowAiFill") is True:
        return True
    return mode in AI_ELIGIBLE_MODES


def _allow_deterministic(job: dict[str, Any], mode: str) -> bool:
    """Deterministic templates are practice-only — never for official PYQ mode."""
    if mode == "official_previous":
        return False
    payload = _request_json(job)
    if payload.get("allowDeterministicFill") is False:
        return False
    if payload.get("allowDeterministicFill") is True:
        return True
    return mode in {"custom_mock", "adaptive", "generated_mock"}


def _optional_int(payload: dict[str, Any], *keys: str) -> int | None:
    for key in keys:
        value = payload.get(key)
        try:
            number = int(value)
        except (TypeError, ValueError):
            continue
        if number > 0:
            return number
    return None


async def process_gov_exam_job(
    job: dict[str, Any],
    *,
    settings: FactorySettings,
    repo: PaperRepository,
    correlation_id: str | None = None,
) -> ProcessJobResponse:
    """Run the hybrid pipeline for one `gov_paper_generation_jobs` row."""
    job_id = str(job["id"])
    correlation = correlation_id or str(
        (_request_json(job).get("correlationId") or job.get("id") or "")
    )
    operation_id = f"gov-exam-{job_id}"

    gov_exam_log(
        "job_received",
        operation_id=operation_id,
        job_id=job_id,
        correlation_id=correlation,
        status=job.get("status"),
        mode=job.get("mode"),
    )

    if job.get("status") == "completed" and job.get("generated_paper_id"):
        return ProcessJobResponse(
            success=True,
            job_id=job_id,
            status="completed",
            paper_id=str(job.get("generated_paper_id")),
            mock_test_id=str(job.get("mock_test_id")) if job.get("mock_test_id") else None,
        )

    factory = PaperFactory(settings, repo)
    payload = _request_json(job)
    mode = str(job.get("mode") or payload.get("mode") or "generated_mock")
    language = str(job.get("language") or payload.get("language") or "en")
    seed = str(job.get("random_seed") or job_id)
    user_id = str(job.get("user_id") or "")
    allow_ai = _allow_ai_fill(job, mode, has_provider=settings.has_ai_provider)
    allow_det = _allow_deterministic(job, mode)

    async def set_stage(stage: str) -> None:
        await asyncio.to_thread(repo.set_stage, job_id, stage)

    try:
        await set_stage("validating")
        await set_stage("building_blueprint")

        request = GenerationRequest(
            exam_query=str(job.get("exam_id")),
            stage=str(job["stage_id"]) if job.get("stage_id") else None,
            mode=mode,
            language=language,
            question_count=_optional_int(payload, "questionCount", "question_count"),
            duration_minutes=_optional_int(payload, "durationMinutes", "duration_minutes"),
            random_seed=seed,
            user_id=user_id or None,
            job_id=job_id,
            use_bank=payload.get("useBank") is not False,
            publish=True,
            make_questions_public=False,
        )

        blueprint = await factory.plan(request)
        await asyncio.to_thread(repo.save_blueprint, job_id, blueprint)
        exam = blueprint.exam

        topics = payload.get("topics") if isinstance(payload.get("topics"), list) else None
        difficulty = payload.get("difficulty")

        gov_exam_log(
            "availability_started",
            operation_id=operation_id,
            job_id=job_id,
            correlation_id=correlation,
            requested=blueprint.total_questions,
        )

        bank_rows, _keys = await asyncio.to_thread(
            load_eligible_bank,
            repo,
            exam,
            language=language,
            topics=topics,
            difficulty=str(difficulty).upper() if difficulty else None,
            verified_only=True,
        )

        gov_exam_log(
            "availability_completed",
            operation_id=operation_id,
            job_id=job_id,
            correlation_id=correlation,
            available=len(bank_rows),
            requested=blueprint.total_questions,
        )

        await set_stage("selecting_questions")
        gov_exam_log(
            "selection_started",
            operation_id=operation_id,
            job_id=job_id,
            correlation_id=correlation,
            pool_size=len(bank_rows),
        )

        bank_for_match = [
            BankQuestion(
                id=row.id,
                question_text=row.question_text,
                options=list(row.options),
                correct_index=row.correct_index,
                subject=row.subject,
                topic=row.topic,
                difficulty=row.difficulty,
                is_verified=True,
            )
            for row in bank_rows
        ]

        validator = CandidateValidator()
        validator.seed_existing((q.question_text, q.options) for q in bank_for_match)
        shuffled = seeded_shuffle(bank_for_match, seed)
        buckets = match_bank_to_sections(shuffled, blueprint)

        bank_selected: dict[str, list[PaperQuestion]] = defaultdict(list)
        bank_count = 0
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

        outstanding = PaperFactory._subtract_bank_coverage(blueprint, bank_selected)
        needed = sum(slot.count for slot in outstanding)

        ai_count = 0
        deterministic_count = 0
        report = None
        need_fallback = False

        if needed > 0 and allow_ai:
            await set_stage("generating_missing_slots")
            gov_exam_log(
                "ai_generation_started",
                operation_id=operation_id,
                job_id=job_id,
                correlation_id=correlation,
                needed=needed,
            )
            try:
                async with MCQGenerator(settings) as ai:
                    report = await generate_for_slots(
                        exam=exam,
                        blueprint=blueprint,
                        slots=outstanding,
                        generator=ai,
                        validator=validator,
                        batch_size=settings.batch_size,
                        max_repair_rounds=settings.max_repair_rounds,
                    )
                if report.shortfalls:
                    need_fallback = True
                    gov_exam_log(
                        "ai_generation_failed",
                        operation_id=operation_id,
                        job_id=job_id,
                        correlation_id=correlation,
                        missing=sum(report.shortfalls.values()),
                        reasons=dict(report.reasons.most_common(4)),
                    )
                else:
                    ai_count = sum(len(v) for v in report.accepted.values())
            except Exception as exc:  # noqa: BLE001
                need_fallback = True
                report = None
                gov_exam_log(
                    "ai_generation_failed",
                    operation_id=operation_id,
                    job_id=job_id,
                    correlation_id=correlation,
                    error=str(exc)[:300],
                )
        elif needed > 0:
            need_fallback = True

        questions = PaperFactory._assemble(blueprint, bank_selected, report)

        if need_fallback or len(questions) < blueprint.total_questions:
            remaining = blueprint.total_questions - len(questions)
            gov_exam_log(
                "python_fallback_started",
                operation_id=operation_id,
                job_id=job_id,
                correlation_id=correlation,
                remaining=remaining,
                allow_deterministic=allow_det,
            )
            used_ids = {q.question_id for q in questions if q.question_id}
            leftovers = [q for q in shuffled if q.id not in used_ids]
            default_section = blueprint.sections[0].code if blueprint.sections else "GEN"
            for item in leftovers:
                if len(questions) >= blueprint.total_questions:
                    break
                questions.append(
                    PaperQuestion(
                        question_text=item.question_text,
                        options=list(item.options),
                        correct_index=item.correct_index,
                        section_code=default_section,
                        subject=item.subject or default_section,
                        topic=item.topic or default_section,
                        difficulty=item.difficulty or "MEDIUM",
                        marks_positive=blueprint.marks_per_question,
                        marks_negative=blueprint.negative_mark,
                        source_class="bank",
                        question_id=item.id,
                        quality_score=90.0,
                    )
                )
            bank_count = sum(1 for q in questions if q.source_class == "bank")

            remaining = blueprint.total_questions - len(questions)
            if remaining > 0 and allow_det:
                variants = generate_practice_variants(count=remaining, seed=seed)
                owner = _uuid_or_none(settings.system_user_id) or _uuid_or_none(user_id)
                exam_type = exam.legacy_exam_type or exam.code or exam.name
                rows = [
                    v.to_insert_row(exam_type=exam_type, owner=owner, language=language)
                    for v in variants
                ]
                inserted_ids: list[str] = []
                for start in range(0, len(rows), 50):
                    chunk = rows[start : start + 50]

                    def _insert(c: list[dict[str, Any]] = chunk) -> Any:
                        return repo.db.table("questions").insert(c).execute()

                    result = await asyncio.to_thread(_insert)
                    inserted_ids.extend(str(r["id"]) for r in (result.data or []))

                for variant, qid in zip(variants, inserted_ids):
                    questions.append(
                        PaperQuestion(
                            question_text=variant.question_text,
                            options=list(variant.options),
                            correct_index=variant.correct_index,
                            section_code=default_section,
                            subject=variant.subject,
                            topic=variant.topic,
                            difficulty=variant.difficulty,
                            explanation=variant.explanation,
                            marks_positive=blueprint.marks_per_question,
                            marks_negative=blueprint.negative_mark,
                            source_class="generated",
                            question_id=qid,
                            quality_score=55.0,
                        )
                    )
                deterministic_count = len(inserted_ids)

        if len(questions) < blueprint.total_questions:
            if mode in EXACT_MODES:
                raise PaperFactoryError(
                    "CONTENT_INSUFFICIENT",
                    f"Only {len(questions)} of {blueprint.total_questions} questions "
                    "could be assembled from bank/AI/deterministic practice.",
                    retryable=bool(allow_ai is False and settings.has_ai_provider is False),
                )
            if len(questions) < MIN_CUSTOM_PRACTICE:
                raise PaperFactoryError(
                    "CONTENT_INSUFFICIENT",
                    f"Only {len(questions)} questions available; need at least "
                    f"{MIN_CUSTOM_PRACTICE} for a practice set.",
                    retryable=True,
                )
            blueprint.total_questions = len(questions)
            blueprint.total_marks = len(questions) * blueprint.marks_per_question
            if ai_count > 0:
                blueprint.paper_class = "ai_generated"
            else:
                blueprint.paper_class = "custom_practice"

        await set_stage("validating_questions")
        gov_exam_log(
            "validation_started",
            operation_id=operation_id,
            job_id=job_id,
            correlation_id=correlation,
            question_count=len(questions),
        )
        balance_answer_keys(questions, blueprint.random_seed)
        errors = validate_assembled_paper(blueprint, questions)
        if errors:
            raise PaperFactoryError(
                "PAPER_VALIDATION_FAILED",
                "Assembled paper failed hard constraints: " + "; ".join(errors[:5]),
            )

        await set_stage("assembling")
        gov_exam_log(
            "assembly_started",
            operation_id=operation_id,
            job_id=job_id,
            correlation_id=correlation,
            question_count=len(questions),
        )

        if not user_id:
            raise PaperFactoryError(
                "USER_REQUIRED", "A user id is required to publish a paper."
            )

        # Persist AI-generated rows that still lack ids (deterministic already inserted).
        ai_qs = [
            q
            for q in questions
            if q.source_class == "generated" and q.question_id is None
        ]
        if ai_qs:
            ids = await asyncio.to_thread(
                repo.insert_questions,
                ai_qs,
                exam=exam,
                language=blueprint.language,
                blueprint=blueprint,
                make_public=False,
            )
            for question, question_id in zip(ai_qs, ids):
                question.question_id = question_id
            ai_count = max(ai_count, len(ai_qs))

        quality = (
            round(sum(q.quality_score for q in questions) / len(questions), 2)
            if questions
            else 0.0
        )
        result = PaperResult(
            blueprint=blueprint,
            questions=questions,
            job_id=job_id,
            quality_score=quality,
            generated_count=ai_count + deterministic_count,
            bank_count=bank_count,
            ai_calls=report.ai_calls if report else 0,
            rejected_count=report.rejected if report else 0,
            rejection_reasons=dict(report.reasons) if report else {},
            warnings=[PRACTICE_DISCLAIMER] if deterministic_count else [],
        )
        provenance = result.provenance_json()
        provenance["deterministic_python"] = deterministic_count
        provenance["generator"] = "python_hybrid_engine"
        if deterministic_count:
            provenance["disclaimer"] = PRACTICE_DISCLAIMER

        paper_id, mock_test_id = await asyncio.to_thread(
            repo.publish_paper,
            blueprint=blueprint,
            questions=questions,
            user_id=user_id,
            job_id=job_id,
            quality_score=quality,
            provenance=provenance,
        )
        await asyncio.to_thread(
            repo.complete_job, job_id, paper_id=paper_id, mock_test_id=mock_test_id
        )

        gov_exam_log(
            "completed",
            operation_id=operation_id,
            job_id=job_id,
            correlation_id=correlation,
            paper_id=paper_id,
            mock_test_id=mock_test_id,
            bank_count=bank_count,
            ai_count=ai_count,
            deterministic_count=deterministic_count,
            question_count=len(questions),
        )

        return ProcessJobResponse(
            success=True,
            job_id=job_id,
            status="completed",
            paper_id=paper_id,
            mock_test_id=mock_test_id,
            question_count=len(questions),
            bank_count=bank_count,
            ai_count=ai_count,
            deterministic_count=deterministic_count,
        )

    except PaperFactoryError as exc:
        status = "failed_retryable" if exc.retryable else "failed_permanent"
        await asyncio.to_thread(
            repo.fail_job,
            job_id,
            code=exc.code,
            message=exc.message,
            retryable=exc.retryable,
        )
        await _compensate(job, repo)
        gov_exam_log(
            "completed",
            operation_id=operation_id,
            job_id=job_id,
            correlation_id=correlation,
            status=status,
            error_code=exc.code,
            success=False,
        )
        return ProcessJobResponse(
            success=False,
            job_id=job_id,
            status=status,
            error_code=exc.code,
            error_message=exc.message,
            retryable=exc.retryable,
        )
    except Exception as exc:  # noqa: BLE001
        await asyncio.to_thread(
            repo.fail_job,
            job_id,
            code="PAPER_GENERATION_FAILED",
            message=str(exc),
            retryable=True,
        )
        await _compensate(job, repo)
        gov_exam_log(
            "completed",
            operation_id=operation_id,
            job_id=job_id,
            correlation_id=correlation,
            status="failed_retryable",
            error_code="PAPER_GENERATION_FAILED",
            success=False,
        )
        return ProcessJobResponse(
            success=False,
            job_id=job_id,
            status="failed_retryable",
            error_code="PAPER_GENERATION_FAILED",
            error_message=str(exc),
            retryable=True,
        )


async def _compensate(job: dict[str, Any], repo: PaperRepository) -> None:
    charged = int(job.get("credits_charged") or 0)
    user_id = job.get("user_id")
    if charged <= 0 or not user_id:
        return
    await asyncio.to_thread(
        repo.refund_credits,
        str(user_id),
        charged,
        f"refund_gov_exam_job_{job.get('id')}",
    )
