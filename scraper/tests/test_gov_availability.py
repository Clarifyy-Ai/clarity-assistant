"""Availability: verified_only, language, requested vs eligible vs available."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.gov_exams.availability import (
    _language_ok,
    compute_availability,
    load_eligible_bank,
)
from app.gov_exams.schemas import AvailabilityRequest
from app.paper_factory.blueprint import EXACT_MODES
from app.paper_factory.models import ExamContext, PaperFactoryError


def _row(
    qid: str,
    *,
    verified: bool = True,
    language: str | None = "en",
    text: str = "What is 2 + 2 in this exam?",
) -> dict:
    return {
        "id": qid,
        "question_text": text,
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
        ],
        "correct_answer": "D",
        "subject": "Quant",
        "topic": "Arithmetic",
        "difficulty": "EASY",
        "exam_type": "SSC_CGL",
        "source": "bank",
        "source_type": "approved_bank",
        "is_public": True,
        "is_verified": verified,
        "publish_status": "published",
        "review_status": "approved",
        "metadata": {"language": language} if language is not None else {},
    }


class _FakeQuery:
    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows
        self.filters: dict[str, object] = {}

    def select(self, _cols: str) -> "_FakeQuery":
        return self

    def in_(self, key: str, values: list[str]) -> "_FakeQuery":
        self.filters[f"in:{key}"] = values
        return self

    def eq(self, key: str, value: object) -> "_FakeQuery":
        self.filters[key] = value
        return self

    def limit(self, _n: int) -> "_FakeQuery":
        return self

    def execute(self) -> SimpleNamespace:
        rows = list(self.rows)
        if self.filters.get("is_verified") is True:
            rows = [r for r in rows if r.get("is_verified")]
        return SimpleNamespace(data=rows)


def _repo(rows: list[dict]) -> MagicMock:
    exam = ExamContext(
        exam_id="exam-1",
        code="SSC_CGL",
        name="SSC CGL",
        legacy_exam_type="SSC_CGL",
        bank_type_keys=("SSC_CGL",),
    )
    repo = MagicMock()
    repo.resolve_exam.return_value = exam
    table = MagicMock()
    table.select.return_value = _FakeQuery(rows)
    # Chain: table("questions").select(...).in_...
    def table_fn(_name: str) -> MagicMock:
        q = _FakeQuery(rows)
        mock_table = MagicMock()
        mock_table.select.return_value = q
        return mock_table

    repo.db.table.side_effect = table_fn
    return repo


def test_language_ok_does_not_silently_switch() -> None:
    hindi_row = {"metadata": {"language": "hi"}}
    untagged = {"metadata": {}}
    english = {"metadata": {"language": "en"}}
    assert _language_ok(english, "en", skip_language=False) is True
    assert _language_ok(untagged, "en", skip_language=False) is True
    assert _language_ok(hindi_row, "en", skip_language=False) is False
    assert _language_ok(english, "hi", skip_language=False) is False
    assert _language_ok(untagged, "hi", skip_language=False) is False
    assert _language_ok(hindi_row, "hi", skip_language=False) is True


def test_verified_only_filters_unverified_rows() -> None:
    rows = [
        _row("q1", verified=True, text="Verified stem for official paper one?"),
        _row("q2", verified=False, text="Unverified stem must not enter official?"),
    ]
    exam = ExamContext(
        exam_id="exam-1",
        code="SSC_CGL",
        name="SSC CGL",
        legacy_exam_type="SSC_CGL",
        bank_type_keys=("SSC_CGL",),
    )
    kept, _ = load_eligible_bank(_repo(rows), exam, verified_only=True)
    assert [q.id for q in kept] == ["q1"]
    kept_all, _ = load_eligible_bank(_repo(rows), exam, verified_only=False)
    assert {q.id for q in kept_all} == {"q1", "q2"}


def test_compute_availability_language_unavailable() -> None:
    rows = [
        _row("q1", language="en", text="English only question about percentages?"),
        _row("q2", language="en", text="Another English arithmetic question here?"),
        _row("q3", language="en", text="Third English question for eligible count?"),
        _row("q4", language="en", text="Fourth English question still not Hindi?"),
        _row("q5", language="en", text="Fifth English question remaining eligible?"),
    ]
    request = AvailabilityRequest(
        exam_id="exam-1",
        language="hi",
        question_count=25,
        mode="custom_mock",
    )
    with pytest.raises(PaperFactoryError) as exc:
        compute_availability(_repo(rows), request)
    assert exc.value.code == "LANGUAGE_UNAVAILABLE"


def test_compute_availability_requested_eligible_available() -> None:
    rows = [
        _row("q1", text="If 20% of a number is 50, what is the number itself?"),
        _row("q2", text="A train 120 m long crosses a pole in 12 seconds. Speed?"),
        _row("q3", text="Simple interest on 2000 at 5% per annum for 2 years is?"),
        _row("q4", text="The next number in the series 2, 6, 12, 20, 30 is?"),
        _row("q5", text="Who is known as the father of the Indian Constitution?"),
        _row("q6", text="Which planet is closest to the Sun in the solar system?"),
        _row("q7", text="Find the synonym of the word benevolent in this sentence."),
        _row("q8", text="A cube has how many faces, edges and vertices altogether listed?"),
    ]
    request = AvailabilityRequest(
        exam_id="exam-1",
        language="en",
        question_count=100,
        mode="generated_mock",
    )
    result = compute_availability(_repo(rows), request)
    assert result.requested == 100
    assert result.eligible == 8
    assert result.available == 8
    assert result.can_full_mock is False
    assert result.can_custom_practice is True
    assert result.custom_practice_max == 8


def test_exact_modes_are_official_and_full_mock() -> None:
    assert "official_previous" in EXACT_MODES
    assert "generated_mock" in EXACT_MODES
    assert "custom_mock" not in EXACT_MODES
