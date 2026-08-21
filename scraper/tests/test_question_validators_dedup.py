"""Unit tests for deterministic Python question validators and deduplication engine."""
from datetime import date
import pytest
from app.document_intelligence.question_validators import (
    ArithmeticValidator,
    AlgebraValidator,
    UnitsValidator,
    DomainRestrictionValidator,
    RoundingValidator,
    SyllogismValidator,
    SeatingArrangementValidator,
    DirectionsValidator,
    CodingDecodingValidator,
    DataSufficiencyValidator,
    ScienceFormulaValidator,
    validate_question_integrity,
    ValidationError,
)
from app.document_intelligence.deduplication import (
    QuestionDeduplicationEngine,
    compute_normalized_hash,
    compute_template_fingerprint,
    evaluate_current_affairs_staleness,
    ngram_jaccard_similarity,
    token_jaccard_similarity,
)


def test_question_integrity_validation():
    # Valid Question
    valid_q = {
        "question_text": "What is the capital of India?",
        "options": ["Mumbai", "New Delhi", "Kolkata", "Chennai"],
        "correct_answer": "B",
        "marks_positive": 2.0,
        "marks_negative": 0.5,
        "language": "en",
        "source": "UPSC_2024",
    }
    res = validate_question_integrity(valid_q)
    assert res["is_valid"] is True
    assert len(res["errors"]) == 0

    # Short stem & duplicate options
    bad_q = {
        "question_text": "Why?",
        "options": ["A", "A", "B"],
        "correct_answer": "A",
        "source": "TEST",
    }
    res = validate_question_integrity(bad_q)
    assert res["is_valid"] is False
    assert any("too short" in e for e in res["errors"])
    assert any("duplicate options" in e for e in res["errors"])

    # Answer leakage
    leaked_q = {
        "question_text": "Calculate the area of a circle. The correct answer is (B).",
        "options": ["10", "20", "30", "40"],
        "correct_answer": "B",
        "source": "SSC",
    }
    res = validate_question_integrity(leaked_q)
    assert res["is_valid"] is False
    assert any("leaked correct answer" in e for e in res["errors"])

    # Missing diagram reference
    missing_media_q = {
        "question_text": "From the given figure below, calculate the resistance.",
        "options": ["5 ohm", "10 ohm", "15 ohm", "20 ohm"],
        "correct_answer": "A",
        "source": "GATE",
    }
    res = validate_question_integrity(missing_media_q)
    assert res["is_valid"] is False
    assert any("figure/diagram" in e for e in res["errors"])


def test_arithmetic_and_algebra_validators():
    # Arithmetic division
    assert ArithmeticValidator.validate_division(100, 4, 25) is True
    with pytest.raises(ValidationError, match="Division by zero"):
        ArithmeticValidator.validate_division(100, 0, 0)

    # Algebra quadratic
    r1, r2 = AlgebraValidator.solve_quadratic(1, -5, 6)
    assert (r1, r2) == (2.0, 3.0)

    with pytest.raises(ValidationError, match="no real roots"):
        AlgebraValidator.solve_quadratic(1, 0, 1)

    # 2x2 linear system: x + y = 5, 2x - y = 4 => x = 3, y = 2
    x, y = AlgebraValidator.verify_linear_system_2x2(1, 1, 5, 2, -1, 4)
    assert (round(x, 2), round(y, 2)) == (3.0, 2.0)


def test_units_and_domain_restrictions():
    assert UnitsValidator.kmh_to_ms(72.0) == 20.0
    assert UnitsValidator.ms_to_kmh(20.0) == 72.0
    assert UnitsValidator.verify_speed_distance_time(60.0, 2.5, 150.0) is True

    assert DomainRestrictionValidator.validate_probability(0.85) is True
    with pytest.raises(ValidationError, match="Probability"):
        DomainRestrictionValidator.validate_probability(1.5)

    assert DomainRestrictionValidator.validate_age_or_count(25, "Age") is True
    with pytest.raises(ValidationError, match="positive integer"):
        DomainRestrictionValidator.validate_age_or_count(-3, "Age")

    assert DomainRestrictionValidator.validate_real_logarithm(100, 10) == 2.0
    with pytest.raises(ValidationError, match="strictly positive"):
        DomainRestrictionValidator.validate_real_logarithm(-5)


def test_reasoning_and_science_validators():
    # Syllogism
    premises = [("all", "dogs", "animals"), ("all", "animals", "living_beings")]
    conclusion = ("all", "dogs", "living_beings")
    assert SyllogismValidator.validate_syllogism(premises, conclusion) is True

    # Seating
    people = ["A", "B", "C", "D"]
    constraints = [{"type": "left_of", "p1": "A", "p2": "C"}, {"type": "adjacent", "p1": "B", "p2": "C"}]
    assert SeatingArrangementValidator.verify_linear_seating(people, constraints) is True

    # Directions: 3m North, 4m East => 5m displacement
    dx, dy, net = DirectionsValidator.calculate_displacement([("N", 3.0), ("E", 4.0)])
    assert (dx, dy, net) == (4.0, 3.0, 5.0)

    # Coding decoding
    assert CodingDecodingValidator.verify_caesar_shift("HELLO", "KHOOR", 3) is True

    # Data sufficiency
    assert DataSufficiencyValidator.evaluate(True, False) == "STATEMENT_1_ALONE"
    assert DataSufficiencyValidator.evaluate(False, False, together_sufficient=True) == "BOTH_TOGETHER"

    # Science formula
    assert ScienceFormulaValidator.newtons_second_law(10.0, 2.5) == 25.0
    assert ScienceFormulaValidator.ohms_law_voltage(2.0, 6.0) == 12.0
    assert ScienceFormulaValidator.kinetic_energy(4.0, 3.0) == 18.0
    assert ScienceFormulaValidator.lens_formula(10.0, 20.0) == (200.0 / 30.0)


def test_deduplication_and_similarity():
    engine = QuestionDeduplicationEngine()

    q1 = "What is the speed of light in vacuum?"
    opts1 = ["3x10^8 m/s", "2x10^8 m/s", "1x10^8 m/s", "4x10^8 m/s"]

    # Exact duplicate
    res_exact = engine.evaluate_pair(q1, opts1, q1, opts1, q2_id="q-2")
    assert res_exact["decision"] == "exact_duplicate"
    assert res_exact["similarity_score"] == 1.0

    # Near duplicate
    q2 = "What is the velocity of light in vacuum?"
    res_near = engine.evaluate_pair(q1, opts1, q2, opts1, q2_id="q-3")
    assert res_near["decision"] in ("near_duplicate", "flagged_for_review")
    assert res_near["similarity_score"] >= 0.70

    # Template clone
    q3 = "A train 200m long passes a pole in 10s. Find speed."
    q4 = "A train 500m long passes a pole in 25s. Find speed."
    res_tpl = engine.evaluate_pair(q3, opts1, q4, opts1, q2_id="q-4")
    assert res_tpl["decision"] == "template_clone"


def test_current_affairs_staleness():
    ref_date = date(2026, 8, 21)

    # Stale by expiry
    stale_exp = evaluate_current_affairs_staleness(
        applicable_date="2023-01-01",
        cutoff_date="2023-06-01",
        expiry_date="2024-01-01",
        reference_date=ref_date,
    )
    assert stale_exp["is_stale"] is True
    assert "expired on 2024-01-01" in stale_exp["reason"]

    # Stale by 1-year cutoff
    stale_cut = evaluate_current_affairs_staleness(
        applicable_date="2024-01-01",
        cutoff_date="2024-01-01",
        expiry_date=None,
        reference_date=ref_date,
    )
    assert stale_cut["is_stale"] is True
    assert "1-year relevancy window" in stale_cut["reason"]

    # Fresh
    fresh = evaluate_current_affairs_staleness(
        applicable_date="2026-08-01",
        cutoff_date="2026-08-01",
        expiry_date="2027-08-01",
        reference_date=ref_date,
    )
    assert fresh["is_stale"] is False
