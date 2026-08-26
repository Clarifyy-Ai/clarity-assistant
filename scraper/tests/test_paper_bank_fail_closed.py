"""Bank fail-closed: never invent questions when inventory is insufficient."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.paper_factory.factory import GenerationRequest, PaperFactory
from app.paper_factory.models import (
    PaperFactoryError,
    PaperBlueprint,
    ExamContext,
    SectionBlueprint,
)
from app.paper_factory.worker import request_from_job


def test_request_from_job_allow_deterministic_only_when_flagged() -> None:
    job = {
        "id": "job-1",
        "exam_id": "exam-1",
        "stage_id": "stage-1",
        "mode": "generated_mock",
        "request_json": {"allowDeterministicFill": True},
    }
    req = request_from_job(job)
    assert req.allow_deterministic_fill is True

    job["request_json"] = {}
    req2 = request_from_job(job)
    assert req2.allow_deterministic_fill is False


def test_factory_fail_closed_without_deterministic_permission() -> None:
    """Short bank + no AI fill permission → CONTENT_INSUFFICIENT, no fabrication."""
    settings = MagicMock()
    settings.has_ai_provider = False
    settings.batch_size = 4
    settings.max_repair_rounds = 1

    exam = ExamContext(
        exam_id="e1",
        code="TEST_EXAM",
        name="Test Exam",
        legacy_exam_type="TEST",
        bank_type_keys=("TEST",),
    )
    blueprint = PaperBlueprint(
        exam=exam,
        pattern_version_id="p1",
        pattern_version="1",
        syllabus_version_id=None,
        syllabus_version=None,
        language="en",
        mode="generated_mock",
        paper_class="ai_generated",
        total_questions=10,
        total_marks=10.0,
        duration_minutes=60,
        negative_mark=0.0,
        marks_per_question=1.0,
        random_seed="seed",
        sections=(
            SectionBlueprint(
                code="gen",
                name="General",
                question_count=10,
                marks=10.0,
                sort_order=1,
                topics=("general",),
                difficulty_counts=(("MEDIUM", 10),),
                topic_counts=(("general", 10),),
            ),
        ),
        slots=(),
        source_years=(2024,),
    )

    factory = PaperFactory(settings, repository=MagicMock())
    factory.repo.load_bank_questions = MagicMock(return_value=[])
    factory.plan = AsyncMock(return_value=blueprint)  # type: ignore[method-assign]

    request = GenerationRequest(
        exam_query="TEST_EXAM",
        mode="generated_mock",
        user_id="user-1",
        job_id="job-1",
        use_bank=True,
        allow_deterministic_fill=False,
        publish=False,
    )

    async def run() -> None:
        with patch.object(
            PaperFactory,
            "_subtract_bank_coverage",
            return_value=[
                MagicMock(
                    count=10,
                    section_code="gen",
                    section_name="General",
                    topic="t",
                    difficulty="MEDIUM",
                )
            ],
        ):
            with pytest.raises(PaperFactoryError) as exc:
                await factory.generate(request)
        assert exc.value.code == "CONTENT_INSUFFICIENT"
        assert "deterministic fill disabled" in exc.value.message.lower()

    asyncio.run(run())
