"""Supabase data access for the paper factory (service-role, RLS-bypassing).

All writes match the exact storage conventions already used by the Deno assembler:
`options` is `[{label, text}]` and `correct_answer` is an uppercase option letter.
"""
from __future__ import annotations

import json
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Sequence

from supabase import Client, create_client

from app.core.logger import get_logger
from app.paper_factory.config import FactorySettings
from app.paper_factory.models import (
    AI_PAPER_DISCLAIMER,
    ExamContext,
    PaperBlueprint,
    PaperFactoryError,
    PaperQuestion,
    PatternSection,
    PatternVersion,
)
from app.shared.algorithm_catalog import (
    dedup_algorithm_version,
    quality_algorithm_version,
)

log = get_logger("paper_factory.repository")

TERMINAL_JOB_STATUSES = (
    "completed",
    "failed",
    "failed_permanent",
    "cancelled",
    "expired",
)
# Note: failed_retryable stays claimable until attempt_count hits the max.


@dataclass(frozen=True)
class BankQuestion:
    id: str
    question_text: str
    options: list[str]
    correct_index: int
    subject: str
    topic: str
    difficulty: str
    is_verified: bool
    source: str = ""
    source_type: str = ""


def _uuid_or_none(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, AttributeError, TypeError):
        return None


def _options_to_texts(raw: Any) -> list[str]:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return []
    if not isinstance(raw, list):
        return []
    texts: list[str] = []
    for item in raw:
        if isinstance(item, dict):
            texts.append(str(item.get("text") or item.get("value") or "").strip())
        else:
            texts.append(str(item).strip())
    return texts


def _letter_to_index(value: Any, option_count: int) -> int:
    raw = str(value or "").strip().upper()
    if len(raw) == 1 and "A" <= raw <= "Z":
        index = ord(raw) - 65
        return index if 0 <= index < option_count else -1
    if raw.isdigit():
        number = int(raw)
        if 1 <= number <= option_count:
            return number - 1
        if 0 <= number < option_count:
            return number
    return -1


class PaperRepository:
    """Synchronous Supabase gateway. Call from async code via `asyncio.to_thread`."""

    def __init__(self, settings: FactorySettings, client: Client | None = None) -> None:
        self.settings = settings
        self.db = client or create_client(
            settings.supabase_url, settings.supabase_service_role_key
        )

    # ── Exam resolution ───────────────────────────────────────────────────────

    def list_exams(self) -> list[dict[str, Any]]:
        result = (
            self.db.table("gov_exams")
            .select("id, code, name, family, legacy_exam_type, review_state, is_public")
            .eq("review_state", "approved")
            .eq("is_public", True)
            .order("code")
            .execute()
        )
        return list(result.data or [])

    def resolve_exam(self, query: str, stage_ref: str | None = None) -> ExamContext:
        """Resolve a user search term (uuid, code, alias or name) to an exam + stage."""
        term = str(query or "").strip()
        if not term:
            raise PaperFactoryError("EXAM_NOT_FOUND", "An exam identifier is required.")

        row: dict[str, Any] | None = None
        columns = "id, code, name, family, legacy_exam_type, review_state, is_public"

        exam_id = _uuid_or_none(term)
        if exam_id:
            found = self.db.table("gov_exams").select(columns).eq("id", exam_id).execute()
            row = (found.data or [None])[0]

        if row is None:
            found = (
                self.db.table("gov_exams")
                .select(columns)
                .ilike("code", term)
                .limit(1)
                .execute()
            )
            row = (found.data or [None])[0]

        if row is None:
            alias = (
                self.db.table("gov_exam_aliases")
                .select("exam_id")
                .ilike("alias", term)
                .limit(1)
                .execute()
            )
            if alias.data:
                found = (
                    self.db.table("gov_exams")
                    .select(columns)
                    .eq("id", alias.data[0]["exam_id"])
                    .execute()
                )
                row = (found.data or [None])[0]

        if row is None:
            found = (
                self.db.table("gov_exams")
                .select(columns)
                .ilike("name", f"%{term}%")
                .eq("review_state", "approved")
                .limit(1)
                .execute()
            )
            row = (found.data or [None])[0]

        if row is None:
            available = ", ".join(e["code"] for e in self.list_exams())
            raise PaperFactoryError(
                "EXAM_NOT_FOUND",
                f"No approved exam matched '{term}'. Available: {available or 'none'}",
            )

        if row.get("review_state") != "approved" or not row.get("is_public"):
            raise PaperFactoryError(
                "EXAM_NOT_APPROVED",
                f"Exam {row.get('code')} is not approved for public generation.",
            )

        stage = self._resolve_stage(row["id"], stage_ref)
        bank_keys = tuple(
            dict.fromkeys(
                key
                for key in (row.get("legacy_exam_type"), row.get("code"), row.get("name"))
                if key
            )
        )

        return ExamContext(
            exam_id=row["id"],
            code=row.get("code") or "",
            name=row.get("name") or "",
            legacy_exam_type=row.get("legacy_exam_type"),
            family=row.get("family"),
            stage_id=stage.get("id") if stage else None,
            stage_code=stage.get("code") if stage else None,
            stage_name=stage.get("name") if stage else None,
            bank_type_keys=bank_keys,
        )

    def _resolve_stage(self, exam_id: str, stage_ref: str | None) -> dict[str, Any] | None:
        stages = (
            self.db.table("gov_exam_stages")
            .select("id, code, name, sort_order")
            .eq("exam_id", exam_id)
            .order("sort_order")
            .execute()
        )
        rows = list(stages.data or [])
        if not rows:
            return None
        if not stage_ref:
            return rows[0]

        needle = str(stage_ref).strip().lower()
        for row in rows:
            if needle in (
                str(row.get("id") or "").lower(),
                str(row.get("code") or "").lower(),
                str(row.get("name") or "").lower(),
            ):
                return row
        for row in rows:
            if needle in str(row.get("name") or "").lower():
                return row
        raise PaperFactoryError(
            "STAGE_NOT_FOUND",
            f"Stage '{stage_ref}' not found. Available: "
            + ", ".join(str(r.get("code")) for r in rows),
        )

    # ── Pattern & syllabus ────────────────────────────────────────────────────

    def load_pattern(self, exam: ExamContext) -> PatternVersion:
        query = (
            self.db.table("gov_exam_pattern_versions")
            .select(
                "id, version, total_questions, total_marks, duration_minutes, "
                "negative_mark, marks_per_question, languages"
            )
            .eq("exam_id", exam.exam_id)
            .eq("review_state", "approved")
        )
        if exam.stage_id:
            query = query.eq("stage_id", exam.stage_id)
        result = query.order("version", desc=True).limit(1).execute()
        row = (result.data or [None])[0]
        if not row:
            raise PaperFactoryError(
                "PATTERN_NOT_FOUND",
                f"No approved exam pattern for {exam.code}"
                + (f" / {exam.stage_name}" if exam.stage_name else ""),
            )

        sections = (
            self.db.table("gov_exam_sections")
            .select("code, name, question_count, marks, sort_order")
            .eq("pattern_version_id", row["id"])
            .order("sort_order")
            .execute()
        )
        section_rows = list(sections.data or [])
        if not section_rows:
            raise PaperFactoryError(
                "PATTERN_INVALID", f"Pattern {row['version']} has no sections."
            )

        languages = row.get("languages") or ["en"]
        return PatternVersion(
            id=row["id"],
            version=str(row.get("version") or "1"),
            total_questions=int(row.get("total_questions") or 0),
            total_marks=float(row.get("total_marks") or 0),
            duration_minutes=int(row.get("duration_minutes") or 60),
            negative_mark=float(row.get("negative_mark") or 0),
            marks_per_question=float(row.get("marks_per_question") or 1),
            languages=tuple(str(lang) for lang in languages),
            sections=tuple(
                PatternSection(
                    code=str(s.get("code")),
                    name=str(s.get("name") or s.get("code")),
                    question_count=int(s.get("question_count") or 0),
                    marks=float(s.get("marks") or 0),
                    sort_order=int(s.get("sort_order") or index),
                )
                for index, s in enumerate(section_rows)
            ),
        )

    def load_syllabus(
        self, exam: ExamContext
    ) -> tuple[str | None, str | None, dict[str, list[str]]]:
        """Return (version_id, version, {section_code: [topics]})."""
        query = (
            self.db.table("gov_exam_syllabus_versions")
            .select("id, version, topics_json, effective_date")
            .eq("exam_id", exam.exam_id)
            .eq("review_state", "approved")
        )
        if exam.stage_id:
            query = query.eq("stage_id", exam.stage_id)
        result = query.order("effective_date", desc=True).limit(1).execute()
        row = (result.data or [None])[0]
        if not row:
            return None, None, {}

        raw = row.get("topics_json")
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except json.JSONDecodeError:
                raw = []

        topics: dict[str, list[str]] = {}
        if isinstance(raw, list):
            for entry in raw:
                if not isinstance(entry, dict):
                    continue
                section = str(entry.get("section") or entry.get("section_code") or "").strip()
                entry_topics = entry.get("topics")
                if section and isinstance(entry_topics, list):
                    topics[section] = [str(t) for t in entry_topics if str(t or "").strip()]
        elif isinstance(raw, dict):
            for section, entry_topics in raw.items():
                if isinstance(entry_topics, list):
                    topics[str(section)] = [
                        str(t) for t in entry_topics if str(t or "").strip()
                    ]

        return row.get("id"), str(row.get("version") or ""), topics

    def load_topic_weights(self, exam: ExamContext) -> dict[str, float]:
        """Weight topics by how often they appear in the existing bank for this exam.

        Topics that have historically appeared more often get a proportionally larger
        share of the paper, which is what makes the output track the real pattern.
        """
        if not exam.bank_type_keys:
            return {}
        result = (
            self.db.table("questions")
            .select("topic")
            .in_("exam_type", list(exam.bank_type_keys))
            .limit(5000)
            .execute()
        )
        counter = Counter(
            str(row.get("topic") or "").strip().lower()
            for row in (result.data or [])
            if str(row.get("topic") or "").strip()
        )
        if not counter:
            return {}
        # Smooth so unseen topics still receive a meaningful share.
        return {topic: 1.0 + count for topic, count in counter.items()}

    # ── Question bank ─────────────────────────────────────────────────────────

    def load_bank_questions(
        self, exam: ExamContext, *, limit: int = 1000, verified_only: bool = True
    ) -> list[BankQuestion]:
        if not exam.bank_type_keys:
            return []
        query = (
            self.db.table("questions")
            .select(
                "id, question_text, options, correct_answer, subject, topic, "
                "difficulty, is_verified, source, source_type"
            )
            .in_("exam_type", list(exam.bank_type_keys))
            .eq("is_public", True)
        )
        if verified_only:
            query = query.eq("is_verified", True)
        result = query.limit(limit).execute()

        bank: list[BankQuestion] = []
        for row in result.data or []:
            options = _options_to_texts(row.get("options"))
            if len(options) < 2:
                continue
            correct_index = _letter_to_index(row.get("correct_answer"), len(options))
            if correct_index < 0:
                continue
            bank.append(
                BankQuestion(
                    id=row["id"],
                    question_text=str(row.get("question_text") or "").strip(),
                    options=options,
                    correct_index=correct_index,
                    subject=str(row.get("subject") or ""),
                    topic=str(row.get("topic") or ""),
                    difficulty=str(row.get("difficulty") or "MEDIUM"),
                    is_verified=bool(row.get("is_verified")),
                    source=str(row.get("source") or ""),
                    source_type=str(row.get("source_type") or ""),
                )
            )
        return bank

    def insert_questions(
        self,
        questions: Sequence[PaperQuestion],
        *,
        exam: ExamContext,
        language: str,
        blueprint: PaperBlueprint,
        make_public: bool = False,
    ) -> list[str]:
        """Insert generated questions and return their ids in the same order."""
        if not questions:
            return []

        exam_type = exam.legacy_exam_type or exam.code or exam.name
        owner = _uuid_or_none(self.settings.system_user_id)
        rows: list[dict[str, Any]] = []
        for question in questions:
            deterministic = question.source_class == "deterministic" or (
                "Deterministic practice variant generated" in question.explanation
            )
            rows.append(
                {
                    "question_text": question.question_text,
                    "question_type": "MCQ",
                    "options": question.options_json(),
                    "correct_answer": question.correct_answer_letter,
                    "explanation": question.explanation or None,
                    "subject": question.subject or question.section_code,
                    "topic": question.topic or question.section_code,
                    "difficulty": question.difficulty,
                    "exam_type": exam_type,
                    "source": "INTERNAL" if deterministic else "AI_GENERATED",
                    "source_type": question.source_type,
                    "quality_algorithm_version": quality_algorithm_version(),
                    "duplicate_algorithm_version": dedup_algorithm_version(),
                    "generator_version": "python_paper_factory_v2",
                    "generation_method": (
                        "template_variant" if deterministic else "ai"
                    ),
                    "marks_positive": question.marks_positive,
                    "marks_negative": question.marks_negative,
                    "is_public": make_public,
                    "is_verified": False,
                    "publish_status": "published" if make_public else "draft",
                    "review_status": "unreviewed",
                    "uploaded_by": owner,
                    "created_by": owner,
                    "latex_present": "$" in question.question_text,
                    "has_image": False,
                    "metadata": {
                        "generator": "python_paper_factory",
                        "section_code": question.section_code,
                        "exam_id": exam.exam_id,
                        "exam_code": exam.code,
                        "stage_id": exam.stage_id,
                        "pattern_version_id": blueprint.pattern_version_id,
                        "syllabus_version_id": blueprint.syllabus_version_id,
                        "language": language,
                        "quality_score": question.quality_score,
                        "quality_algorithm_version": quality_algorithm_version(),
                        "duplicate_algorithm_version": dedup_algorithm_version(),
                        "ai_generated": not deterministic,
                        "generated_by": "deterministic_python" if deterministic else "python_paper_factory",
                        "generation_method": "template_variant" if deterministic else "ai",
                        "official_pyq": False,
                        "disclaimer": (
                            "Deterministic practice variant generated by Python templates. "
                            "Not an official previous-year question."
                            if deterministic
                            else AI_PAPER_DISCLAIMER
                        ),
                    },
                }
            )

        inserted: list[str] = []
        # Chunked to stay well inside PostgREST payload limits on large papers.
        for start in range(0, len(rows), 50):
            chunk = rows[start : start + 50]
            result = self.db.table("questions").insert(chunk).execute()
            data = list(result.data or [])
            if len(data) != len(chunk):
                raise PaperFactoryError(
                    "QUESTION_PERSIST_FAILED",
                    f"Inserted {len(data)} of {len(chunk)} generated questions.",
                    retryable=True,
                )
            inserted.extend(str(row["id"]) for row in data)
        return inserted

    # ── Publication ───────────────────────────────────────────────────────────

    def publish_paper(
        self,
        *,
        blueprint: PaperBlueprint,
        questions: Sequence[PaperQuestion],
        user_id: str,
        job_id: str | None,
        quality_score: float,
        provenance: dict[str, Any],
        title: str | None = None,
        paper_source: str | None = None,
        source_mix: dict[str, Any] | None = None,
    ) -> tuple[str, str]:
        """Create the mock_test + gov_generated_papers rows. Returns (paper_id, mock_test_id)."""
        question_ids = [q.question_id for q in questions if q.question_id]
        if len(question_ids) != len(questions):
            raise PaperFactoryError(
                "QUESTION_PERSIST_FAILED",
                "Every paper question must be persisted before publication.",
            )

        paper_title = title or (
            f"{blueprint.exam.name}"
            + (f" — {blueprint.exam.stage_name}" if blueprint.exam.stage_name else "")
            + " — Practice Mock Paper"
        )
        resolved_mix = source_mix or provenance.get("source_mix") or {}
        if paper_source is None:
            if len(resolved_mix) > 1:
                paper_source = "hybrid_realistic_mock"
            elif "ai_generated_practice" in resolved_mix:
                paper_source = "ai_generated_practice"
            elif "generated_practice" in resolved_mix:
                paper_source = "generated_practice"
            else:
                paper_source = "approved_bank"

        mock = (
            self.db.table("mock_tests")
            .insert(
                {
                    "user_id": user_id,
                    "test_name": paper_title,
                    "question_ids": question_ids,
                    "status": "DRAFT",
                    "attempt_phase": "NOT_STARTED",
                    "time_limit_minutes": blueprint.duration_minutes,
                    "config": {
                        "exam_type": blueprint.exam.legacy_exam_type
                        or blueprint.exam.code,
                        "gov_exam_id": blueprint.exam.exam_id,
                        "gov_stage_id": blueprint.exam.stage_id,
                        "exam_code": blueprint.exam.code,
                        "stage_name": blueprint.exam.stage_name,
                        "language": blueprint.language,
                        "mode": blueprint.mode,
                        "paper_class": blueprint.paper_class,
                        "question_count": len(question_ids),
                        "requested_question_count": blueprint.total_questions,
                        "total_marks": blueprint.total_marks,
                        "marks_positive": blueprint.marks_per_question,
                        "marks_negative": blueprint.negative_mark,
                        "marks_per_question": blueprint.marks_per_question,
                        "negative_mark": blueprint.negative_mark,
                        "duration_minutes": blueprint.duration_minutes,
                        "sections": [s.to_json() for s in blueprint.sections],
                        "generator": "python_paper_factory",
                        "generation_job_id": job_id,
                        "disclaimer": blueprint.label,
                        "scoring_version": "gov_exam_snapshot_v1",
                    },
                }
            )
            .execute()
        )
        mock_rows = list(mock.data or [])
        if not mock_rows:
            raise PaperFactoryError(
                "PAPER_PERSIST_FAILED", "Failed to create the mock test.", retryable=True
            )
        mock_test_id = str(mock_rows[0]["id"])

        paper = (
            self.db.table("gov_generated_papers")
            .insert(
                {
                    "exam_id": blueprint.exam.exam_id,
                    "stage_id": blueprint.exam.stage_id,
                    "pattern_version_id": blueprint.pattern_version_id,
                    "syllabus_version_id": blueprint.syllabus_version_id,
                    "job_id": job_id,
                    "created_by": user_id,
                    "title": paper_title,
                    "paper_class": blueprint.paper_class,
                    "language": blueprint.language,
                    "question_count": len(question_ids),
                    "total_marks": blueprint.total_marks,
                    "duration_minutes": blueprint.duration_minutes,
                    "negative_mark": blueprint.negative_mark,
                    "blueprint_json": blueprint.to_json(),
                    "provenance_json": provenance,
                    "quality_score": quality_score,
                    "quality_algorithm_version": quality_algorithm_version(),
                    "duplicate_algorithm_version": dedup_algorithm_version(),
                    "review_state": "machine_validated",
                    "disclaimer": blueprint.label,
                    "mock_test_id": mock_test_id,
                    "paper_source": paper_source,
                    "source_mix": resolved_mix,
                }
            )
            .execute()
        )
        paper_rows = list(paper.data or [])
        if not paper_rows:
            raise PaperFactoryError(
                "PAPER_PERSIST_FAILED",
                "Failed to create the generated paper record.",
                retryable=True,
            )
        paper_id = str(paper_rows[0]["id"])

        # Link paper id back onto the attempt config (Edge/TestResults expect gov_paper_id).
        mock_config = dict(mock_rows[0].get("config") or {})
        mock_config["gov_paper_id"] = paper_id
        self.db.table("mock_tests").update({"config": mock_config}).eq(
            "id", mock_test_id
        ).execute()

        links = [
            {
                "paper_id": paper_id,
                "question_id": question.question_id,
                "section_code": question.section_code,
                "sort_order": index,
                "source_class": (
                    "generated"
                    if question.source_class == "deterministic"
                    else question.source_class
                ),
                "question_source_type": (
                    getattr(question, "question_source_type", None)
                    or getattr(question, "source_type", None)
                    or (
                        "official_verified"
                        if question.source_class == "previous_year"
                        else "generated_practice"
                        if question.source_class in ("generated", "deterministic")
                        else "approved_bank"
                    )
                ),
                "snapshot_json": {
                    "question_text": question.question_text,
                    "options": question.options_json(),
                    "correct_answer": question.correct_answer_letter,
                    "question_type": "MCQ",
                    "subject": question.subject,
                    "topic": question.topic,
                    "difficulty": question.difficulty,
                    "language": question.language,
                    "marks_positive": question.marks_positive,
                    "marks_negative": question.marks_negative,
                    "section_code": question.section_code,
                    "explanation": question.explanation,
                    "source_type": getattr(question, "source_type", None),
                    "source_class": question.source_class,
                },
            }
            for index, question in enumerate(questions)
        ]
        for start in range(0, len(links), 100):
            self.db.table("gov_generated_paper_questions").insert(
                links[start : start + 100]
            ).execute()

        return paper_id, mock_test_id

    # ── Job lifecycle ─────────────────────────────────────────────────────────

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        result = (
            self.db.table("gov_paper_generation_jobs")
            .select("*")
            .eq("id", job_id)
            .limit(1)
            .execute()
        )
        return (result.data or [None])[0]

    def claim_next_job(self, worker_id: str) -> dict[str, Any] | None:
        """Claim the oldest queued/expired-lease job routed to the Python factory."""
        now = datetime.now(timezone.utc)
        cutoff = now.isoformat()
        candidates = (
            self.db.table("gov_paper_generation_jobs")
            .select("*")
            .not_.in_("status", list(TERMINAL_JOB_STATUSES))
            .lt("attempt_count", self.settings.max_job_attempts)
            .order("created_at")
            .limit(20)
            .execute()
        )

        for job in candidates.data or []:
            lease = job.get("lease_expires_at")
            if lease and str(lease) > cutoff and job.get("worker_id") != worker_id:
                continue
            if not self._wants_python_factory(job):
                continue
            claimed = self._claim(job, worker_id, now)
            if claimed:
                return claimed
        return None

    def claim_job(self, job_id: str, worker_id: str) -> dict[str, Any] | None:
        """Atomically claim one explicitly routed job for HTTP dispatch."""
        job = self.get_job(job_id)
        if not job or not self._wants_python_factory(job):
            return None
        if str(job.get("status") or "") in TERMINAL_JOB_STATUSES:
            return None
        lease = job.get("lease_expires_at")
        if lease:
            try:
                if datetime.fromisoformat(str(lease).replace("Z", "+00:00")) > datetime.now(timezone.utc):
                    return None
            except ValueError:
                pass
        if int(job.get("attempt_count") or 0) >= self.settings.max_job_attempts:
            return None
        return self._claim(job, worker_id, datetime.now(timezone.utc))

    @staticmethod
    def _wants_python_factory(job: dict[str, Any]) -> bool:
        """Only claim jobs explicitly routed to the Python factory.

        Edge sets request_json.generator = "python_paper_factory" when
        PAPER_FACTORY_WORKER=1. Jobs without that marker stay for the Edge
        assembler (process-paper-generation-job) to avoid double-claim races.
        """
        request = job.get("request_json") or {}
        generator = str(request.get("generator") or "").strip().lower()
        return generator in ("python_paper_factory", "python", "factory")

    def _claim(
        self, job: dict[str, Any], worker_id: str, now: datetime
    ) -> dict[str, Any] | None:
        """Optimistically lock the job by matching its current attempt_count."""
        lease_expiry = now + timedelta(seconds=self.settings.lease_seconds)
        update = (
            self.db.table("gov_paper_generation_jobs")
            .update(
                {
                    "worker_id": worker_id,
                    "lease_expires_at": lease_expiry.isoformat(),
                    "heartbeat_at": now.isoformat(),
                    "attempt_count": int(job.get("attempt_count") or 0) + 1,
                    "status": "analyzing_pattern",
                    "progress_stage": "analyzing_pattern",
                    "started_at": job.get("started_at") or now.isoformat(),
                    "updated_at": now.isoformat(),
                }
            )
            .eq("id", job["id"])
            .eq("attempt_count", int(job.get("attempt_count") or 0))
            .execute()
        )
        rows = list(update.data or [])
        return rows[0] if rows else None

    def set_stage(self, job_id: str, stage: str) -> None:
        now = datetime.now(timezone.utc)
        lease = now + timedelta(seconds=self.settings.lease_seconds)
        self.db.table("gov_paper_generation_jobs").update(
            {
                "status": stage,
                "progress_stage": stage,
                "heartbeat_at": now.isoformat(),
                "lease_expires_at": lease.isoformat(),
                "updated_at": now.isoformat(),
            }
        ).eq("id", job_id).execute()

    def save_blueprint(self, job_id: str, blueprint: PaperBlueprint) -> None:
        self.db.table("gov_paper_generation_jobs").update(
            {
                "blueprint_json": blueprint.to_json(),
                "pattern_version_id": blueprint.pattern_version_id,
                "syllabus_version_id": blueprint.syllabus_version_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", job_id).execute()

    def complete_job(
        self, job_id: str, *, paper_id: str, mock_test_id: str
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self.db.table("gov_paper_generation_jobs").update(
            {
                "status": "completed",
                "progress_stage": "completed",
                "generated_paper_id": paper_id,
                "mock_test_id": mock_test_id,
                "completed_at": now,
                "updated_at": now,
                "lease_expires_at": None,
                "error_code": None,
                "error_message": None,
            }
        ).eq("id", job_id).execute()

    def patch_job_source_mix(
        self,
        job_id: str,
        *,
        mix: dict[str, Any],
        missing_count: int = 0,
    ) -> None:
        self.db.table("gov_paper_generation_jobs").update(
            {
                "source_mix": mix,
                "missing_count": missing_count,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", job_id).execute()

    def fail_job(
        self, job_id: str, *, code: str, message: str, retryable: bool
    ) -> None:
        """Mark a job failed. Retryable keeps it reclaimable; permanent is terminal."""
        now = datetime.now(timezone.utc).isoformat()
        if retryable:
            # Match Edge: clear lease so claim_next_job can reclaim; no completed_at.
            # failed_retryable stays outside TERMINAL_JOB_STATUSES until max attempts.
            payload: dict[str, Any] = {
                "status": "failed_retryable",
                "progress_stage": "failed_retryable",
                "error_code": code,
                "error_message": message[:500],
                "retryable": True,
                "completed_at": None,
                "updated_at": now,
                "worker_id": None,
                "lease_expires_at": None,
            }
        else:
            payload = {
                "status": "failed_permanent",
                "progress_stage": "failed_permanent",
                "error_code": code,
                "error_message": message[:500],
                "retryable": False,
                "completed_at": now,
                "updated_at": now,
                "worker_id": None,
                "lease_expires_at": None,
            }
        self.db.table("gov_paper_generation_jobs").update(payload).eq(
            "id", job_id
        ).execute()

    def claim_credits_for_refund(self, job_id: str) -> int:
        """Atomically claim credits_charged so only one path can refund this job.

        Mirrors Edge `claimJobCreditsForRefund`: read amount, then update to 0 only
        when credits_charged still equals that amount. Returns 0 if already claimed.
        """
        result = (
            self.db.table("gov_paper_generation_jobs")
            .select("credits_charged, credits_reserved, credits_released_at, credits_finalized_at")
            .eq("id", job_id)
            .limit(1)
            .execute()
        )
        row = (result.data or [None])[0]
        if not row:
            return 0
        if row.get("credits_released_at") or row.get("credits_finalized_at"):
            return 0
        amount = max(
            0,
            int(row.get("credits_reserved") or 0),
            int(row.get("credits_charged") or 0),
        )
        if amount <= 0:
            return 0

        claimed = (
            self.db.table("gov_paper_generation_jobs")
            .update(
                {
                    "credits_charged": 0,
                    "credits_reserved": 0,
                    "credits_released_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .eq("id", job_id)
            .is_("credits_released_at", "null")
            .execute()
        )
        if not (claimed.data or []):
            return 0
        return amount

    def refund_credits(
        self,
        user_id: str,
        amount: int,
        reason: str,
        *,
        idempotency_key: str | None = None,
    ) -> bool:
        """Compensate a charged-but-failed generation via the canonical credit RPC.

        Callers must claim via ``claim_credits_for_refund`` first. Optional
        ``idempotency_key`` best-effort-dedupes against ``idempotency_log`` (Edge parity).
        """
        if amount <= 0:
            return True

        if idempotency_key:
            try:
                prior = (
                    self.db.table("idempotency_log")
                    .select("response, expires_at")
                    .eq("key", idempotency_key)
                    .limit(1)
                    .execute()
                )
                prior_row = (prior.data or [None])[0]
                if prior_row:
                    expires = prior_row.get("expires_at")
                    response = prior_row.get("response") or {}
                    still_valid = True
                    if expires:
                        try:
                            still_valid = (
                                datetime.fromisoformat(
                                    str(expires).replace("Z", "+00:00")
                                )
                                > datetime.now(timezone.utc)
                            )
                        except ValueError:
                            still_valid = False
                    if still_valid and isinstance(response, dict) and response.get("success") is True:
                        return True
            except Exception:  # noqa: BLE001 - idempotency is best-effort
                pass

        try:
            self.db.rpc(
                "refund_credits",
                {"p_user_id": user_id, "p_cost": amount, "p_reason": reason},
            ).execute()
            if idempotency_key:
                try:
                    self.db.table("idempotency_log").upsert(
                        {
                            "key": idempotency_key,
                            "response": {"success": True, "credits": amount},
                            "expires_at": (
                                datetime.now(timezone.utc) + timedelta(hours=24)
                            ).isoformat(),
                            "metadata": {
                                "user_id": user_id,
                                "action": f"refund:{reason}",
                            },
                        },
                        on_conflict="key",
                    ).execute()
                except Exception:  # noqa: BLE001 - idempotency store is best-effort
                    pass
            return True
        except Exception as exc:  # noqa: BLE001 - refund failure must not mask the original error
            log.error("paper_factory_refund_failed", user_id=user_id, error=str(exc))
            return False
