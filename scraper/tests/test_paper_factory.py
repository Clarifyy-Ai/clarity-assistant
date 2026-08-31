"""Unit tests for the government exam paper factory (no network, no database)."""
from __future__ import annotations

import pytest

from app.paper_factory.ai import extract_json_object
from app.paper_factory.blueprint import (
    allocate,
    build_blueprint,
    humanize,
    scale_sections,
    split_slots_for_batching,
    validate_assembled_paper,
    validate_blueprint,
)
from app.paper_factory.factory import (
    PaperFactory,
    balance_answer_keys,
    match_bank_to_sections,
)
from app.paper_factory.models import (
    ExamContext,
    GenerationSlot,
    PaperFactoryError,
    PaperQuestion,
    PatternSection,
    PatternVersion,
)
from app.paper_factory.prompts import build_generation_prompt, resolve_profile
from app.paper_factory.repository import BankQuestion
from app.paper_factory.validate import (
    CandidateValidator,
    normalize_options,
    resolve_correct_index,
)
from app.paper_factory.worker import request_from_job

# ── Fixtures mirroring the real SSC CGL Tier I row set ─────────────────────────

SSC_SECTIONS = (
    PatternSection("reasoning", "General Intelligence & Reasoning", 25, 50.0, 1),
    PatternSection("awareness", "General Awareness", 25, 50.0, 2),
    PatternSection("quant", "Quantitative Aptitude", 25, 50.0, 3),
    PatternSection("english", "English Comprehension", 25, 50.0, 4),
)

SSC_SYLLABUS = {
    "reasoning": ["analogy", "classification", "series", "coding_decoding", "syllogism"],
    "awareness": ["history", "geography", "polity", "economy", "science"],
    "quant": ["arithmetic", "algebra", "geometry", "mensuration", "trigonometry"],
    "english": ["grammar", "vocabulary", "comprehension", "error_spotting"],
}


@pytest.fixture
def exam() -> ExamContext:
    return ExamContext(
        exam_id="350462c0-9111-4555-b19f-1eee6880cb22",
        code="SSC_CGL",
        name="SSC Combined Graduate Level",
        legacy_exam_type="SSC Exams (CGL/CHSL)",
        stage_id="stage-1",
        stage_code="TIER1",
        stage_name="Tier I",
        bank_type_keys=("SSC Exams (CGL/CHSL)", "SSC_CGL"),
    )


@pytest.fixture
def pattern() -> PatternVersion:
    return PatternVersion(
        id="pattern-1",
        version="2024.1",
        total_questions=100,
        total_marks=200.0,
        duration_minutes=60,
        negative_mark=0.5,
        marks_per_question=2.0,
        sections=SSC_SECTIONS,
    )


def make_blueprint(exam, pattern, **overrides):
    kwargs = dict(
        exam=exam,
        pattern=pattern,
        syllabus_topics=SSC_SYLLABUS,
        language="en",
        mode="generated_mock",
        random_seed="test-seed",
    )
    kwargs.update(overrides)
    return build_blueprint(**kwargs)


# ── Allocation ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("total", [0, 1, 7, 25, 100, 137])
def test_allocate_always_sums_to_total(total: int) -> None:
    counts = allocate(total, [3.0, 1.0, 1.0, 5.0])
    assert sum(counts) == total
    assert all(c >= 0 for c in counts)


def test_allocate_respects_min_each_when_affordable() -> None:
    counts = allocate(10, [100.0, 1.0, 1.0], min_each=1)
    assert sum(counts) == 10
    assert all(c >= 1 for c in counts)


def test_allocate_drops_min_each_when_unaffordable() -> None:
    counts = allocate(2, [1.0, 1.0, 1.0], min_each=1)
    assert sum(counts) == 2


def test_allocate_handles_zero_weights() -> None:
    counts = allocate(9, [0.0, 0.0, 0.0])
    assert sum(counts) == 9


def test_humanize_slugs() -> None:
    assert humanize("coding_decoding") == "Coding Decoding"
    assert humanize("data-interpretation") == "Data Interpretation"
    assert humanize("General Awareness") == "General Awareness"
    assert humanize("") == ""


# ── Blueprint ─────────────────────────────────────────────────────────────────


def test_full_pattern_produces_exact_plan(exam, pattern) -> None:
    blueprint = make_blueprint(exam, pattern)

    assert blueprint.total_questions == 100
    assert blueprint.total_marks == 200.0
    assert blueprint.paper_class == "ai_generated"
    assert sum(s.question_count for s in blueprint.sections) == 100
    assert sum(s.count for s in blueprint.slots) == 100
    assert validate_blueprint(blueprint) == []

    for section in blueprint.sections:
        assert sum(c for _, c in section.topic_counts) == section.question_count
        assert sum(c for _, c in section.difficulty_counts) == section.question_count
        assert section.topics, "every section must have at least one topic"


def test_sections_fall_back_to_section_name_without_syllabus(exam, pattern) -> None:
    blueprint = make_blueprint(exam, pattern, syllabus_topics={})
    for section in blueprint.sections:
        assert len(section.topics) == 1


def test_custom_count_rescales_sections(exam, pattern) -> None:
    blueprint = make_blueprint(exam, pattern, mode="custom_mock", custom_question_count=40)

    assert blueprint.total_questions == 40
    assert blueprint.paper_class == "custom_practice"
    assert sum(s.question_count for s in blueprint.sections) == 40
    assert sum(s.count for s in blueprint.slots) == 40
    assert blueprint.total_marks == 80.0


def test_custom_count_cannot_exceed_pattern(exam, pattern) -> None:
    blueprint = make_blueprint(exam, pattern, mode="custom_mock", custom_question_count=500)
    assert blueprint.total_questions == 100


def test_custom_count_has_a_floor(exam, pattern) -> None:
    blueprint = make_blueprint(exam, pattern, mode="custom_mock", custom_question_count=1)
    assert blueprint.total_questions == 5
    assert sum(s.question_count for s in blueprint.sections) == 5


def test_invalid_mode_is_rejected(exam, pattern) -> None:
    with pytest.raises(PaperFactoryError) as err:
        make_blueprint(exam, pattern, mode="telepathy")
    assert err.value.code == "INVALID_MODE"


def test_pattern_without_sections_is_rejected(exam) -> None:
    empty = PatternVersion(
        id="p", version="1", total_questions=10, total_marks=10.0,
        duration_minutes=10, negative_mark=0.0, marks_per_question=1.0, sections=(),
    )
    with pytest.raises(PaperFactoryError) as err:
        make_blueprint(exam, empty)
    assert err.value.code == "PATTERN_INVALID"


def test_topic_weights_bias_the_distribution(exam, pattern) -> None:
    weighted = make_blueprint(
        exam, pattern, topic_weights={"arithmetic": 500.0}
    )
    quant = weighted.section_by_code("quant")
    assert quant is not None
    counts = dict(quant.topic_counts)
    assert counts["Arithmetic"] == max(counts.values())
    assert sum(counts.values()) == quant.question_count


def test_scale_sections_preserves_total() -> None:
    scaled = scale_sections(SSC_SECTIONS, 37)
    assert sum(s.question_count for s in scaled) == 37
    assert all(s.question_count >= 1 for s in scaled)


def test_split_slots_for_batching_respects_batch_size() -> None:
    slot = GenerationSlot("quant", "Quantitative Aptitude", "Arithmetic", "MEDIUM", 25)
    batches = split_slots_for_batching([slot], 8)
    assert [b.count for b in batches] == [8, 8, 8, 1]
    assert sum(b.count for b in batches) == 25


def test_deterministic_for_same_seed(exam, pattern) -> None:
    first = make_blueprint(exam, pattern, random_seed="stable")
    second = make_blueprint(exam, pattern, random_seed="stable")
    assert first.to_json() == second.to_json()


# ── Assembled paper validation ────────────────────────────────────────────────


def make_question(index: int, section: str = "quant") -> PaperQuestion:
    return PaperQuestion(
        question_text=f"What is the value of {index} plus {index}?",
        options=["1", "2", "3", "4"],
        correct_index=index % 4,
        section_code=section,
        subject="Quantitative Aptitude",
        topic="Arithmetic",
        difficulty="MEDIUM",
        explanation="Adding a number to itself doubles it, which is the definition used here.",
        marks_positive=2.0,
        marks_negative=0.5,
        quality_score=80.0,
    )


def test_assembled_paper_rejects_wrong_count(exam, pattern) -> None:
    blueprint = make_blueprint(exam, pattern)
    errors = validate_assembled_paper(blueprint, [make_question(1)])
    assert any("Exact question count failed" in e for e in errors)


def test_assembled_paper_rejects_duplicate_stems(exam, pattern) -> None:
    blueprint = make_blueprint(exam, pattern, mode="custom_mock", custom_question_count=5)
    questions = [make_question(1) for _ in range(5)]
    for question in questions:
        question.section_code = blueprint.sections[0].code
    errors = validate_assembled_paper(blueprint, questions)
    assert any("Duplicate question stem" in e for e in errors)


def test_assembled_paper_checks_section_totals(exam, pattern) -> None:
    blueprint = make_blueprint(exam, pattern, mode="generated_mock")
    questions = [make_question(i, section="quant") for i in range(5)]
    errors = validate_assembled_paper(blueprint, questions)
    assert any("expected" in e for e in errors)


# ── Candidate validation ──────────────────────────────────────────────────────


def test_normalize_options_handles_dicts_and_labels() -> None:
    assert normalize_options(
        [{"label": "A", "text": "First"}, {"label": "B", "text": "Second"}]
    ) == ["First", "Second"]
    assert normalize_options(["A) First", "B. Second"]) == ["First", "Second"]
    assert normalize_options("nonsense") == []


@pytest.mark.parametrize(
    ("value", "expected"),
    [("A", 0), ("b", 1), ("(C)", 2), ("D", 3), ("2", 1), ("0", 0), ("Z", None), ("", None)],
)
def test_resolve_correct_index(value: str, expected: int | None) -> None:
    assert resolve_correct_index(value, 4) == expected


GOOD_CANDIDATE = {
    "question_text": "If a train travels 180 km in 3 hours, what is its average speed?",
    "options": [
        {"label": "A", "text": "50 km/h"},
        {"label": "B", "text": "60 km/h"},
        {"label": "C", "text": "70 km/h"},
        {"label": "D", "text": "90 km/h"},
    ],
    "correct_answer": "B",
    "explanation": "Average speed equals total distance divided by total time, so 180 divided by 3 gives 60 km/h.",
    "difficulty": "EASY",
}

SLOT = GenerationSlot("quant", "Quantitative Aptitude", "Arithmetic", "EASY", 5)


def evaluate(validator: CandidateValidator, candidate: dict):
    return validator.evaluate(
        candidate, slot=SLOT, marks_positive=2.0, marks_negative=0.5
    )


def test_validator_accepts_a_clean_candidate() -> None:
    outcome = evaluate(CandidateValidator(), GOOD_CANDIDATE)
    assert outcome.accepted
    question = outcome.question
    assert question is not None
    assert question.correct_answer_letter == "B"
    assert question.section_code == "quant"
    assert question.quality_score >= 40


def test_validator_rejects_wrong_option_count() -> None:
    candidate = {**GOOD_CANDIDATE, "options": [{"text": "1"}, {"text": "2"}, {"text": "3"}]}
    outcome = evaluate(CandidateValidator(), candidate)
    assert outcome.reason == "option_count_not_four"


def test_validator_rejects_duplicate_options() -> None:
    candidate = {
        **GOOD_CANDIDATE,
        "options": [{"text": "60 km/h"}] * 4,
    }
    assert evaluate(CandidateValidator(), candidate).reason == "duplicate_options"


def test_validator_rejects_unresolvable_answer() -> None:
    candidate = {**GOOD_CANDIDATE, "correct_answer": "Q"}
    assert (
        evaluate(CandidateValidator(), candidate).reason == "unresolvable_correct_answer"
    )


def test_validator_rejects_short_stem() -> None:
    candidate = {**GOOD_CANDIDATE, "question_text": "Why?"}
    assert evaluate(CandidateValidator(), candidate).reason == "stem_too_short"


def test_validator_rejects_image_references() -> None:
    candidate = {
        **GOOD_CANDIDATE,
        "question_text": "Study the chart. Reference Image shows the trend for the year.",
    }
    assert evaluate(CandidateValidator(), candidate).reason == "banned_media_reference"


def test_validator_rejects_answer_leakage() -> None:
    candidate = {
        **GOOD_CANDIDATE,
        "question_text": "What is the average speed of the train? Answer: B is correct.",
    }
    outcome = evaluate(CandidateValidator(), candidate)
    assert outcome.reason is not None
    assert outcome.reason.startswith("integrity")


def test_validator_rejects_unattached_passage_reference() -> None:
    candidate = {
        **GOOD_CANDIDATE,
        "question_text": "Read the passage above and choose the closest meaning of the word.",
    }
    assert not evaluate(CandidateValidator(), candidate).accepted


def test_validator_rejects_exact_duplicate_within_paper() -> None:
    validator = CandidateValidator()
    assert evaluate(validator, GOOD_CANDIDATE).accepted
    assert evaluate(validator, GOOD_CANDIDATE).reason == "exact_duplicate"


def test_validator_rejects_clone_of_a_bank_question() -> None:
    validator = CandidateValidator()
    validator.seed_existing(
        [(GOOD_CANDIDATE["question_text"], ["50 km/h", "60 km/h", "70 km/h", "90 km/h"])]
    )
    assert not evaluate(validator, GOOD_CANDIDATE).accepted


def test_validator_falls_back_to_slot_difficulty() -> None:
    candidate = {**GOOD_CANDIDATE, "difficulty": "IMPOSSIBLE"}
    outcome = evaluate(CandidateValidator(), candidate)
    assert outcome.question is not None
    assert outcome.question.difficulty == "EASY"


# ── Prompts ───────────────────────────────────────────────────────────────────


def test_prompt_includes_context_and_hard_rules(exam) -> None:
    prompt = build_generation_prompt(
        exam=exam,
        slot=SLOT,
        language="hi",
        marks_positive=2.0,
        marks_negative=0.5,
        avoid_stems=["An earlier stem about trains"],
    )
    assert "exactly 5" in prompt
    assert "Arithmetic" in prompt
    assert "Quantitative Aptitude" in prompt
    assert "Hindi" in prompt
    assert "+2.0" in prompt
    assert "An earlier stem about trains" in prompt
    assert "Reference Image" in prompt  # the ban is stated explicitly
    assert "correct_answer" in prompt


def test_prompt_marks_no_negative_marking_clearly(exam) -> None:
    prompt = build_generation_prompt(
        exam=exam, slot=SLOT, language="en", marks_positive=1.0, marks_negative=0.0
    )
    assert "no negative marking" in prompt


def test_exam_profile_resolution_is_fuzzy() -> None:
    assert "SSC" in resolve_profile("SSC Exams (CGL/CHSL)")["pattern"]
    assert resolve_profile("Totally Unknown Exam")["pattern"]
    assert "State Public Service" in resolve_profile("Unknown PSC", "state_psc")["pattern"]
    assert "JEE" in resolve_profile("JEE_MAIN", "academic")["pattern"]


def test_difficulty_mix_falls_back_to_family() -> None:
    from app.paper_factory.blueprint import difficulty_mix_for

    ssc = difficulty_mix_for("SSC Exams (CGL/CHSL)")
    assert ssc["EASY"] == 35
    family = difficulty_mix_for("Brand New Exam", "academic")
    assert family["HARD"] == 35
    unknown = difficulty_mix_for("Brand New Exam", "not-a-family")
    assert unknown["HARD"] == 20


# ── AI response parsing ───────────────────────────────────────────────────────


def test_extract_json_from_fenced_block() -> None:
    raw = '```json\n{"questions": [{"question_text": "x"}]}\n```'
    assert extract_json_object(raw)["questions"][0]["question_text"] == "x"


def test_extract_json_from_surrounding_prose() -> None:
    raw = 'Here you go:\n{"questions": []}\nHope that helps.'
    assert extract_json_object(raw) == {"questions": []}


def test_extract_json_raises_without_object() -> None:
    with pytest.raises(ValueError):
        extract_json_object("no json at all")


# ── Bank matching, answer balancing, coverage subtraction ──────────────────────


def bank_item(qid: str, subject: str, topic: str) -> BankQuestion:
    return BankQuestion(
        id=qid,
        question_text=f"Bank question {qid} about {topic}",
        options=["1", "2", "3", "4"],
        correct_index=1,
        subject=subject,
        topic=topic,
        difficulty="EASY",
        is_verified=True,
    )


def test_bank_items_map_to_the_right_section(exam, pattern) -> None:
    blueprint = make_blueprint(exam, pattern)
    buckets = match_bank_to_sections(
        [
            bank_item("q1", "Quantitative Aptitude", "Average"),
            bank_item("q2", "English", "Vocabulary"),
            bank_item("q3", "Astrology", "Horoscopes"),
        ],
        blueprint,
    )
    assert "q1" in [q.id for q in buckets["quant"]]
    assert "q2" in [q.id for q in buckets["english"]]
    assert all("q3" not in [q.id for q in items] for items in buckets.values())


def test_a_bank_item_is_never_used_twice(exam, pattern) -> None:
    blueprint = make_blueprint(exam, pattern)
    buckets = match_bank_to_sections([bank_item("q1", "Quantitative Aptitude", "Average")], blueprint)
    assert sum(len(items) for items in buckets.values()) == 1


def test_balance_answer_keys_spreads_correct_answers() -> None:
    questions = []
    for index in range(12):
        question = make_question(index)
        question.correct_index = 1  # everything on B, like the current bank
        question.source_class = "generated"
        questions.append(question)

    balance_answer_keys(questions, "seed")
    distribution = {q.correct_answer_letter for q in questions}
    assert len(distribution) == 4


def test_balance_answer_keys_preserves_the_correct_option_text() -> None:
    question = make_question(1)
    question.options = ["alpha", "beta", "gamma", "delta"]
    question.correct_index = 1
    question.source_class = "generated"
    expected = question.options[question.correct_index]

    balance_answer_keys([question], "seed")
    assert question.options[question.correct_index] == expected
    assert sorted(question.options) == ["alpha", "beta", "delta", "gamma"]


def test_balance_answer_keys_leaves_bank_items_alone() -> None:
    question = make_question(1)
    question.correct_index = 1
    question.source_class = "bank"
    balance_answer_keys([question], "seed")
    assert question.correct_index == 1


def test_balance_answer_keys_skips_all_of_the_above() -> None:
    question = make_question(1)
    question.options = ["alpha", "beta", "gamma", "All of the above"]
    question.correct_index = 3
    question.source_class = "generated"
    balance_answer_keys([question], "seed")
    assert question.options[3] == "All of the above"


def test_bank_coverage_reduces_generation_slots(exam, pattern) -> None:
    blueprint = make_blueprint(exam, pattern)
    quant_bank = [make_question(i, section="quant") for i in range(10)]

    outstanding = PaperFactory._subtract_bank_coverage(blueprint, {"quant": quant_bank})
    total = sum(slot.count for slot in outstanding)
    quant_total = sum(s.count for s in outstanding if s.section_code == "quant")

    assert total == blueprint.total_questions - 10
    assert quant_total == 15


def test_full_bank_coverage_needs_no_generation(exam, pattern) -> None:
    blueprint = make_blueprint(exam, pattern, mode="custom_mock", custom_question_count=8)
    coverage = {
        section.code: [make_question(i, section.code) for i in range(section.question_count)]
        for section in blueprint.sections
    }
    assert PaperFactory._subtract_bank_coverage(blueprint, coverage) == []


# ── Worker job translation ────────────────────────────────────────────────────


def test_request_from_job_maps_every_field() -> None:
    request = request_from_job(
        {
            "id": "job-1",
            "user_id": "user-1",
            "exam_id": "exam-1",
            "stage_id": "stage-1",
            "mode": "custom_mock",
            "language": "hi",
            "random_seed": "seed-1",
            "request_json": {"questionCount": 40, "durationMinutes": 30},
        }
    )
    assert request.exam_query == "exam-1"
    assert request.stage == "stage-1"
    assert request.mode == "custom_mock"
    assert request.language == "hi"
    assert request.question_count == 40
    assert request.duration_minutes == 30
    assert request.user_id == "user-1"
    assert request.job_id == "job-1"
    assert request.publish is True


def test_request_from_job_ignores_invalid_counts() -> None:
    request = request_from_job(
        {
            "id": "job-2",
            "user_id": "user-1",
            "exam_id": "exam-1",
            "mode": "generated_mock",
            "request_json": {"questionCount": "abc", "durationMinutes": -5},
        }
    )
    assert request.question_count is None
    assert request.duration_minutes is None
    assert request.stage is None
