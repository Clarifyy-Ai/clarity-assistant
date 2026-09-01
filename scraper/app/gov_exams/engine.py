"""Hybrid job processor: availability → selection → optional AI → Python fallback."""
from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from app.ai_policy import FEATURE_POLICIES, decide_ai
from app.gov_exams.availability import MIN_CUSTOM_PRACTICE, load_eligible_bank
from app.gov_exams.deterministic_generate import (
    PRACTICE_DISCLAIMER,
    PRACTICE_SOURCE_TYPE,
)
from app.gov_exams.observability import gov_exam_log
from app.gov_exams.repair import repair_paper
from app.gov_exams.schemas import ProcessJobResponse, QuestionPayload, ValidateQuestionsRequest, fields_from_job_row
from app.gov_exams.validator import validate_question_payloads
from app.gov_exams.selection import seeded_shuffle
from app.gov_exams.slot_fill import fill_bank_into_slots
from app.gov_exams.source_priority import (
    map_to_legacy_source_class,
    normalize_source_type,
    resolve_paper_source,
    sort_by_source_priority,
    summarize_source_mix,
)
from app.paper_factory.ai import MCQGenerator
from app.paper_factory.blueprint import EXACT_MODES, validate_assembled_paper
from app.paper_factory.config import FactorySettings
from app.paper_factory.factory import (
    GenerationRequest,
    PaperFactory,
    balance_answer_keys,
)
from app.paper_factory.generator import generate_for_slots
from app.paper_factory.models import ALGORITHM_VERSION, PaperFactoryError, PaperQuestion, PaperResult
from app.paper_factory.repository import BankQuestion, PaperRepository
from app.paper_factory.validate import CandidateValidator

AI_ELIGIBLE_MODES = frozenset({"generated_mock", "custom_mock", "adaptive"})
GOV_QUESTION_COUNT_MIN = 5
GOV_QUESTION_COUNT_MAX = 100


def _clamp_question_count(raw: int | None, *, default: int = 25) -> int:
    if raw is None or raw < GOV_QUESTION_COUNT_MIN:
        return GOV_QUESTION_COUNT_MIN
    return min(GOV_QUESTION_COUNT_MAX, int(raw))


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


def _eligible_to_bank(row: Any) -> BankQuestion:
    return BankQuestion(
        id=row.id,
        question_text=row.question_text,
        options=list(row.options),
        correct_index=row.correct_index,
        subject=row.subject,
        topic=row.topic,
        difficulty=row.difficulty,
        is_verified=row.is_verified,
        source=row.source,
        source_type=row.source_type,
        explanation=str(getattr(row, "explanation", "") or ""),
        source_id=getattr(row, "source_id", None),
        source_document=getattr(row, "source_document", None),
        source_page=getattr(row, "source_page", None),
        source_year=getattr(row, "source_year", None),
        ingestion_job_id=getattr(row, "ingestion_job_id", None),
        python_generated=bool(getattr(row, "python_generated", False)),
        metadata=getattr(row, "metadata", None),
    )


def _question_payloads(questions: list[PaperQuestion], language: str) -> list[QuestionPayload]:
    return [
        QuestionPayload(
            id=q.question_id,
            question_text=q.question_text,
            options=q.options,
            correct_index=q.correct_index,
            explanation=q.explanation or None,
            subject=q.subject or None,
            topic=q.topic or None,
            difficulty=q.difficulty or None,
            language=q.language or language,
            source=q.source_type or None,
            metadata={"generated_by": q.source_class},
        )
        for q in questions
    ]


def _paper_fields_from_blueprint(blueprint: Any, *, mix: dict[str, int] | None = None) -> dict[str, Any]:
    return {
        "sections": [s.to_json() for s in blueprint.sections] if getattr(blueprint, "sections", None) else None,
        "marks": getattr(blueprint, "total_marks", None),
        "negative_marking": getattr(blueprint, "negative_mark", None),
        "duration": getattr(blueprint, "duration_minutes", None),
        "language": getattr(blueprint, "language", None),
        "blueprint_version": ALGORITHM_VERSION,
        "source_summary": mix,
        "validation_result": "passed",
    }


def _granular_mix(questions: list[PaperQuestion], deterministic_ids: set[str]) -> dict[str, int]:
    types: list[str] = []
    for q in questions:
        st = normalize_source_type(
            source_type=getattr(q, "source_type", None) or getattr(q, "question_source_type", None),
            source_class=q.source_class,
        )
        if q.source_class == "previous_year":
            st = "official_verified"
        elif q.python_generated or (q.question_id and q.question_id in deterministic_ids):
            st = PRACTICE_SOURCE_TYPE
        elif q.ai_generated or (
            q.source_class == "generated" and st not in {PRACTICE_SOURCE_TYPE, "ai_generated_practice"}
        ):
            if q.question_id and q.question_id in deterministic_ids:
                st = PRACTICE_SOURCE_TYPE
            else:
                st = "ai_generated_practice"
        elif q.source_class == "deterministic":
            st = PRACTICE_SOURCE_TYPE
        types.append(st)
        q.question_source_type = st
        q.source_class = map_to_legacy_source_class(st)  # type: ignore[assignment]
        q.generated_practice = st in {PRACTICE_SOURCE_TYPE, "ai_generated_practice"}
        q.python_generated = st == PRACTICE_SOURCE_TYPE
        q.ai_generated = st == "ai_generated_practice"
        if q.generated_practice:
            q.source_id = None
            q.source_document = None
            q.source_page = None
            q.source_year = None
            q.ingestion_job_id = None
    return {k: v for k, v in summarize_source_mix(types).items() if v > 0}


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
        extra = fields_from_job_row(job)
        return ProcessJobResponse(
            success=True,
            accepted=True,
            job_id=job_id,
            status="completed",
            paper_id=str(job.get("generated_paper_id")),
            mock_test_id=str(job.get("mock_test_id")) if job.get("mock_test_id") else None,
            **extra,
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
        await set_stage("checking_availability")
        await set_stage("building_blueprint")

        raw_count = _optional_int(payload, "questionCount", "question_count")
        question_count = _clamp_question_count(raw_count)

        request = GenerationRequest(
            exam_query=str(job.get("exam_id")),
            stage=str(job["stage_id"]) if job.get("stage_id") else None,
            mode=mode,
            language=language,
            question_count=question_count,
            duration_minutes=_optional_int(payload, "durationMinutes", "duration_minutes"),
            random_seed=seed,
            user_id=user_id or None,
            job_id=job_id,
            use_bank=payload.get("useBank") is not False,
            publish=True,
            make_questions_public=False,
            allow_deterministic_fill=allow_det,
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
            verified_only=(mode == "official_previous"),
        )

        eligible_any_lang, _ = await asyncio.to_thread(
            load_eligible_bank,
            repo,
            exam,
            language="",
            topics=topics,
            difficulty=str(difficulty).upper() if difficulty else None,
            verified_only=(mode == "official_previous"),
            skip_language=True,
        )

        gov_exam_log(
            "availability_completed",
            operation_id=operation_id,
            job_id=job_id,
            correlation_id=correlation,
            available=len(bank_rows),
            eligible=len(eligible_any_lang),
            requested=blueprint.total_questions,
        )

        wanted_lang = (language or "en").strip().lower()
        if (
            wanted_lang not in ("", "en", "eng", "english")
            and len(bank_rows) == 0
            and len(eligible_any_lang) > 0
        ):
            raise PaperFactoryError(
                "LANGUAGE_UNAVAILABLE",
                f"No approved questions are available in language '{language}'.",
                retryable=False,
            )

        await set_stage("selecting_questions")
        gov_exam_log(
            "selection_started",
            operation_id=operation_id,
            job_id=job_id,
            correlation_id=correlation,
            pool_size=len(bank_rows),
        )

        bank_for_match = [_eligible_to_bank(row) for row in bank_rows]

        validator = CandidateValidator()
        validator.seed_existing((q.question_text, q.options) for q in bank_for_match)
        # Prefer official/verified bank rows before generic approved bank.
        prioritized = sort_by_source_priority(
            bank_for_match,
            get_source=lambda q: normalize_source_type(
                source=q.source,
                source_type=q.source_type,
                source_class="bank",
            ),
        )
        shuffled = seeded_shuffle(prioritized, seed)
        bank_selected, leftovers = fill_bank_into_slots(shuffled, blueprint, mode=mode)
        bank_count = sum(len(items) for items in bank_selected.values())

        questions = [q for items in bank_selected.values() for q in items]
        used_ids = {q.question_id for q in questions if q.question_id}
        leftovers = [q for q in leftovers if q.id not in used_ids]
        questions, leftovers, det_pre = repair_paper(
            blueprint,
            questions,
            leftovers,
            mode=mode,
            allow_det=allow_det,
            seed=seed,
            max_rounds=1,
        )
        deterministic_count = det_pre
        deterministic_ids: set[str] = set()
        for q in questions:
            if q.python_generated and q.question_id:
                deterministic_ids.add(q.question_id)
        validator.seed_existing((q.question_text, q.options) for q in questions)

        bank_selected = defaultdict(list)
        for question in questions:
            bank_selected[question.section_code].append(question)
        bank_count = sum(
            1
            for q in questions
            if q.source_class in {"bank", "previous_year"} and not q.generated_practice
        )

        outstanding = PaperFactory._subtract_bank_coverage(blueprint, bank_selected)
        needed = sum(slot.count for slot in outstanding)
        decision = decide_ai(
            feature="gov_exam_gap_fill",
            needed_count=needed,
            permitted=allow_ai,
            provider_configured=settings.has_ai_provider,
            official_mode=mode == "official_previous",
        )

        ai_count = 0
        report = None
        need_fallback = False

        async def on_ai_progress(_done: int, _total: int) -> None:
            await asyncio.to_thread(repo.heartbeat, job_id)

        if needed > 0 and decision == "AI_REQUIRED":
            await set_stage("generating_missing_slots")
            gap_policy = FEATURE_POLICIES["gov_exam_gap_fill"]
            gov_exam_log(
                "ai_generation_started",
                operation_id=operation_id,
                job_id=job_id,
                correlation_id=correlation,
                needed=needed,
                prompt_version=gap_policy.prompt_version,
                decision=decision,
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
                        on_progress=on_ai_progress,
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
        used_ids = {q.question_id for q in questions if q.question_id}
        leftovers = [q for q in leftovers if q.id not in used_ids]

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
            questions, leftovers, det_added = repair_paper(
                blueprint,
                questions,
                leftovers,
                mode=mode,
                allow_det=allow_det,
                seed=seed,
                max_rounds=settings.max_repair_rounds,
            )
            deterministic_count += det_added
            bank_count = sum(
                1
                for q in questions
                if q.source_class in {"bank", "previous_year"} and not q.generated_practice
            )
            for q in questions:
                if q.python_generated and q.question_id:
                    deterministic_ids.add(q.question_id)

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

        def _rejected_indices(qs: list[PaperQuestion]) -> set[int]:
            if not qs:
                return set()
            val = validate_question_payloads(
                ValidateQuestionsRequest(
                    questions=_question_payloads(qs, language),
                    correlation_id=correlation,
                    job_id=job_id,
                    language=language,
                    reject_near_duplicates=True,
                ),
                operation_id=operation_id,
            )
            if val.rejected_count <= 0:
                return set()
            return {int(r.index) for r in val.rejected}

        questions, leftovers, det_added = repair_paper(
            blueprint,
            questions,
            leftovers,
            mode=mode,
            allow_det=allow_det,
            seed=f"{seed}:val",
            max_rounds=settings.max_repair_rounds,
            validate_fn=_rejected_indices,
        )
        deterministic_count += det_added
        for q in questions:
            if q.python_generated and q.question_id:
                deterministic_ids.add(q.question_id)

        balance_answer_keys(questions, blueprint.random_seed)
        errors = validate_assembled_paper(blueprint, questions)
        if errors:
            questions, leftovers, det_added = repair_paper(
                blueprint,
                questions,
                leftovers,
                mode=mode,
                allow_det=allow_det,
                seed=f"{seed}:asm",
                max_rounds=settings.max_repair_rounds,
            )
            deterministic_count += det_added
            balance_answer_keys(questions, blueprint.random_seed)
            errors = validate_assembled_paper(blueprint, questions)
        if errors:
            if mode in EXACT_MODES and any(
                "Exact question count" in e or e.startswith("Section ") for e in errors
            ):
                raise PaperFactoryError(
                    "CONTENT_INSUFFICIENT",
                    "Assembled paper failed hard constraints after repair: "
                    + "; ".join(errors[:5]),
                    retryable=False,
                )
            raise PaperFactoryError(
                "PAPER_VALIDATION_FAILED",
                "Assembled paper failed hard constraints: " + "; ".join(errors[:5]),
                retryable=False,
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

        # Persist generated rows that still lack ids (bank rows already exist).
        pending_insert = [
            q
            for q in questions
            if q.question_id is None
            and q.source_class in ("generated", "deterministic")
        ]
        if pending_insert:
            ids = await asyncio.to_thread(
                repo.insert_questions,
                pending_insert,
                exam=exam,
                language=blueprint.language,
                blueprint=blueprint,
                make_public=False,
            )
            for question, question_id in zip(pending_insert, ids):
                question.question_id = question_id
                if question.python_generated or question.source_class == "deterministic":
                    deterministic_ids.add(question_id)
            ai_count = max(
                ai_count, sum(1 for q in pending_insert if q.ai_generated)
            )

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
        mix = _granular_mix(questions, deterministic_ids)
        bank_count = (
            mix.get("official_verified", 0)
            + mix.get("verified_public_source", 0)
            + mix.get("approved_bank", 0)
            + mix.get("internal_question_bank", 0)
            + mix.get("admin_uploaded", 0)
        )
        ai_count = mix.get("ai_generated_practice", 0)
        deterministic_count = mix.get("generated_practice", 0)
        paper_source = resolve_paper_source(mix, mode=mode)
        provenance["deterministic_python"] = deterministic_count
        provenance["generator"] = "python_hybrid_engine"
        provenance["source_mix"] = mix
        provenance["paper_source"] = paper_source
        provenance["question_source_types"] = mix
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
            paper_source=paper_source,
            source_mix=mix,
        )
        await asyncio.to_thread(
            repo.complete_job, job_id, paper_id=paper_id, mock_test_id=mock_test_id
        )
        await asyncio.to_thread(
            repo.patch_job_source_mix,
            job_id,
            mix=mix,
            missing_count=max(0, blueprint.total_questions - len(questions)),
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

        extra = _paper_fields_from_blueprint(blueprint, mix=mix)
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
            source_mix=mix,
            paper_source=paper_source,
            **extra,
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
        # Retryable crash: re-queue only — never refund (matches Edge failJob).
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
