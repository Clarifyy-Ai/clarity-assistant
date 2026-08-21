"""Unit tests for Gap Analysis Pydantic models."""
import pytest
from pydantic import ValidationError
from app.models.schemas import GapAnalysisRequest, GapAnalysisResult


def test_gap_analysis_request_valid():
    req = GapAnalysisRequest(
        resume_id="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        jd_id="b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
        force_rerun=True,
    )
    assert req.resume_id == "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
    assert req.jd_id == "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22"
    assert req.force_rerun is True


def test_gap_analysis_result_valid():
    res = GapAnalysisResult(
        match_score=88.5,
        matching_skills=["Python", "FastAPI", "PostgreSQL"],
        missing_skills=["Kubernetes"],
        recommendations=["Gain hands-on experience with K8s deployments."],
        experience_gap="Meets senior backend requirements.",
        education_fit="B.Tech Computer Science matches degree criteria.",
        resume_version="hash-res-v1",
        jd_version="hash-jd-v1",
        status="completed",
    )
    assert res.match_score == 88.5
    assert len(res.matching_skills) == 3
    assert res.status == "completed"
    assert res.resume_version == "hash-res-v1"


def test_gap_analysis_result_score_bounds():
    # Score < 0
    with pytest.raises(ValidationError):
        GapAnalysisResult(match_score=-5.0)

    # Score > 100
    with pytest.raises(ValidationError):
        GapAnalysisResult(match_score=150.0)
