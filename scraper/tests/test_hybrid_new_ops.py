"""Hybrid new ops: minimal payloads, truthful outputs, invented_facts False."""

from __future__ import annotations

import pytest

from app.engines.schemas import EngineError
from app.hybrid.operations import (
    analyze_test,
    gap_analysis,
    prep_coding,
    prep_project,
    prep_rephrase,
    run_operation,
    session_debrief,
    session_scorecard,
    speech_process,
)


def _assert_truthful(result: dict, *, expect_invented_facts_key: bool = True) -> None:
    assert isinstance(result, dict)
    assert result.get("source"), "expected source field on hybrid output"
    if expect_invented_facts_key:
        assert result.get("invented_facts") is False


class TestGapAnalysis:
    def test_empty_payload(self) -> None:
        result = gap_analysis({})
        _assert_truthful(result)
        assert result["matched_skills"] == []
        assert result["missing_skills"] == []
        assert isinstance(result["coverage_score"], float)

    def test_minimal_skill_overlap(self) -> None:
        result = gap_analysis(
            {
                "resume_skills": ["Python", "SQL"],
                "jd_skills": ["Python", "AWS"],
            }
        )
        _assert_truthful(result)
        assert "python" in result["matched_skills"]
        assert "aws" in result["missing_skills"]


class TestSessionDebrief:
    def test_requires_ai_instead_of_canned_strengths(self) -> None:
        with pytest.raises(EngineError) as exc:
            session_debrief({})
        assert exc.value.code == "DEBRIEF_AI_REQUIRED"
        assert exc.value.retryable is True

    def test_minimal_metrics_also_requires_ai(self) -> None:
        with pytest.raises(EngineError) as exc:
            session_debrief(
                {"duration_seconds": 120, "questions_asked": 2, "highlights": ["Clear opener"]}
            )
        assert exc.value.code == "DEBRIEF_AI_REQUIRED"
        assert "Stayed engaged" not in str(exc.value)


class TestSessionScorecard:
    def test_empty_payload(self) -> None:
        result = session_scorecard({})
        _assert_truthful(result)
        assert "overall_score" in result
        assert "dimensions" in result
        assert result["grade"] in {"A", "B", "C", "D"}

    def test_minimal_scores(self) -> None:
        result = session_scorecard({"answered": 3, "total": 5})
        _assert_truthful(result)
        assert result["dimensions"]["completion"] == 60


class TestAnalyzeTest:
    def test_empty_payload(self) -> None:
        result = analyze_test({})
        _assert_truthful(result)
        assert result["score_percent"] == 0
        assert result["correct"] == 0
        assert result["total"] == 0

    def test_minimal_score(self) -> None:
        result = analyze_test({"correct": 7, "total": 10, "weak_topics": ["Graphs"]})
        _assert_truthful(result)
        assert result["score_percent"] == 70
        assert "Graphs" in result["summary"]


class TestPrepRephrase:
    def test_empty_payload(self) -> None:
        result = prep_rephrase({})
        _assert_truthful(result)
        assert result["rephrased"] == ""
        assert result.get("error") == "empty_input"

    def test_minimal_filler_cleanup(self) -> None:
        result = prep_rephrase({"text": "um I built um a service"})
        _assert_truthful(result)
        assert "um" not in result["rephrased"].lower()
        assert "built" in result["rephrased"]


class TestPrepCoding:
    def test_empty_payload(self) -> None:
        result = prep_coding({})
        _assert_truthful(result)
        assert result["content"]
        assert isinstance(result["hints"], list)

    def test_hint_mode(self) -> None:
        result = prep_coding({"prompt": "Two sum", "mode": "hint"})
        _assert_truthful(result)
        assert "edge cases" in result["content"].lower()


class TestPrepProject:
    def test_empty_payload(self) -> None:
        result = prep_project({})
        _assert_truthful(result)
        assert "sections" in result
        assert result["title"]

    def test_minimal_topic(self) -> None:
        result = prep_project({"topic": "URL shortener"})
        _assert_truthful(result)
        assert "URL shortener" in result["title"]


class TestSpeechProcess:
    def test_empty_payload_raises(self) -> None:
        with pytest.raises(Exception):
            speech_process({})

    def test_minimal_transcript(self) -> None:
        result = speech_process({"transcript": "Hello world.  This works."})
        _assert_truthful(result)
        assert result["transcript"]
        assert result["word_count"] >= 2
        assert result["sentence_count"] >= 1

    def test_via_run_operation_dispatch(self) -> None:
        result = run_operation("speech_process", {"text": "Hi there"})
        _assert_truthful(result)
        assert "Hi there" in result["normalized"]


class TestRunOperationDispatch:
    @pytest.mark.parametrize(
        "op",
        [
            "gap_analysis",
            "session_scorecard",
            "analyze_test",
            "prep_rephrase",
            "prep_coding",
            "prep_project",
            "prep_raw_prompt",
            "company_research_skeleton",
        ],
    )
    def test_registered_ops_accept_empty_payload(self, op: str) -> None:
        result = run_operation(op, {})
        _assert_truthful(result, expect_invented_facts_key=op != "speech_process")

    def test_session_debrief_dispatch_requires_ai(self) -> None:
        with pytest.raises(EngineError) as exc:
            run_operation("session_debrief", {})
        assert exc.value.code == "DEBRIEF_AI_REQUIRED"
