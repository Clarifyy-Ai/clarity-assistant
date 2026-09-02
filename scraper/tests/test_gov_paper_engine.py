"""Business tests: slot fill, repair, source mix, ack semantics, official fail-closed."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from app.gov_exams.engine import process_gov_exam_job
from app.gov_exams.repair import (
    fill_deterministic_shortfalls,
    fill_leftovers_section_safe,
    repair_paper,
)
from app.gov_exams.schemas import ProcessJobResponse
from app.gov_exams.slot_fill import (
    fill_bank_into_slots,
    match_bank_to_sections,
    strip_generated_provenance,
)
from app.gov_exams.source_priority import resolve_paper_source, summarize_source_mix
from app.paper_factory.blueprint import build_blueprint, validate_assembled_paper
from app.paper_factory.factory import PaperFactory
from app.paper_factory.models import (
    ExamContext,
    GenerationSlot,
    PaperBlueprint,
    PaperQuestion,
    PatternSection,
    PatternVersion,
    SectionBlueprint,
)
from app.paper_factory.repository import BankQuestion


def _exam() -> ExamContext:
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


def _qid_n(qid: str) -> int:
    digits = "".join(ch for ch in qid if ch.isdigit())
    return int(digits) if digits else abs(hash(qid)) % 97


# Distinct sentence structures so peer similarity stays below stem_only_conflict (0.8).
_ARITH_STEMS = [
    lambda a, b, c, q: (
        f"A cistern of {a} litres fills through two pipes in {b} minutes. Combined rate for lot {q}?",
        [f"{c} L/min", f"{a + b} L/min", f"{abs(a - b)} L/min", f"{a * 2} L/min"],
    ),
    lambda a, b, c, q: (
        f"Simple interest on Rs {a * 100} at {b}% for {c} years equals which amount in case {q}?",
        [f"Rs {a * b * c}", f"Rs {a + b}", f"Rs {c * 10}", f"Rs {a * 50}"],
    ),
    lambda a, b, c, q: (
        f"A train {a} m long crosses a pole in {b} seconds. Speed in km/h for run {q}?",
        [f"{c} km/h", f"{a} km/h", f"{b * 3} km/h", f"{a // max(b, 1)} km/h"],
    ),
    lambda a, b, c, q: (
        f"The average of {a} consecutive odd numbers starting at {b} is which value (set {q})?",
        [f"{c}", f"{a + b}", f"{b * 2}", f"{a * b}"],
    ),
    lambda a, b, c, q: (
        f"Work: A finishes in {a} days, B in {b} days. Days together to complete task {q}?",
        [f"{c} days", f"{a + b} days", f"{abs(a - b)} days", f"{a * b} days"],
    ),
    lambda a, b, c, q: (
        f"Ratio {a}:{b} of a mixture totals {c} litres. First component volume in mix {q}?",
        [f"{a} L", f"{b} L", f"{c} L", f"{a + b} L"],
    ),
    lambda a, b, c, q: (
        f"CP of an article is Rs {a}. Sold at {b}% profit. SP for invoice {q}?",
        [f"Rs {c}", f"Rs {a}", f"Rs {b}", f"Rs {a + b}"],
    ),
    lambda a, b, c, q: (
        f"A clock gains {a} minutes in {b} hours. True time after {c} hours for clock {q}?",
        [f"{a} min fast", f"{b} min slow", f"{c} min exact", f"no change"],
    ),
    lambda a, b, c, q: (
        f"HCF of {a * b} and {b * c} is which number in problem {q}?",
        [f"{b}", f"{a}", f"{c}", f"{a * c}"],
    ),
    lambda a, b, c, q: (
        f"A boat covers {a} km downstream in {b} hours. Speed of stream if still water is {c} km/h ({q})?",
        [f"{a} km/h", f"{b} km/h", f"{c} km/h", f"1 km/h"],
    ),
    lambda a, b, c, q: (
        f"Percentage: {a} is what percent of {b} in worksheet {q}?",
        [f"{c}%", f"{a}%", f"{b}%", f"100%"],
    ),
    lambda a, b, c, q: (
        f"A square field of side {a} m is fenced at Rs {b}/m. Total cost for plot {q}?",
        [f"Rs {c}", f"Rs {a * 4}", f"Rs {b * 4}", f"Rs {a + b}"],
    ),
    lambda a, b, c, q: (
        f"Compound interest on Rs {a} at {b}% for 2 years, compounded yearly, for deposit {q}?",
        [f"Rs {c}", f"Rs {a}", f"Rs {b}", f"Rs {a + b}"],
    ),
    lambda a, b, c, q: (
        f"Ages: father is {a}, son is {b}. After {c} years ratio of ages for family {q}?",
        [f"{a}:{b}", f"{a + c}:{b + c}", f"{b}:{a}", f"1:1"],
    ),
    lambda a, b, c, q: (
        f"A shopkeeper marks {a}% above CP and allows {b}% discount. Net profit for bill {q}?",
        [f"{c}%", f"{a}%", f"{b}%", f"0%"],
    ),
    lambda a, b, c, q: (
        f"Time: a man walks {a} km at {b} km/h. Minutes taken for journey {q}?",
        [f"{c} min", f"{a} min", f"{b} min", f"{a * b} min"],
    ),
    lambda a, b, c, q: (
        f"LCM of {a}, {b} and {c} is required for timetable {q}. Which is LCM?",
        [f"{a * b}", f"{a}", f"{b}", f"{c}"],
    ),
    lambda a, b, c, q: (
        f"A circle has radius {a} cm. Area in terms of pi for figure {q}?",
        [f"{a * a} pi", f"{2 * a} pi", f"{c} pi", f"{b} pi"],
    ),
    lambda a, b, c, q: (
        f"If 12 men take {a} days, how many men finish the same work in {b} days (crew {q})?",
        [f"{c} men", f"{a} men", f"{b} men", f"12 men"],
    ),
    lambda a, b, c, q: (
        f"A number when divided by {a} leaves remainder {b}. Smallest such number above {c} for {q}?",
        [f"{a + b}", f"{c + 1}", f"{a * b}", f"{c}"],
    ),
    lambda a, b, c, q: (
        f"Mixture of milk {a} L and water {b} L. Milk percent in vessel {q}?",
        [f"{c}%", f"{a}%", f"{b}%", f"50%"],
    ),
    lambda a, b, c, q: (
        f"Triangle sides {a}, {b}, {c}. Is it right-angled for triangle {q}?",
        ["yes, Pythagoras holds", "no, acute only", "no, obtuse only", "cannot say"],
    ),
    lambda a, b, c, q: (
        f"A sum doubles in {a} years at SI. Rate percent per annum for account {q}?",
        [f"{c}%", f"{a}%", f"{b}%", f"50%"],
    ),
    lambda a, b, c, q: (
        f"Series: {a}, {a + b}, {a + 2 * b}, ... 10th term for sequence {q}?",
        [f"{a + 9 * b}", f"{c}", f"{a * 10}", f"{b * 10}"],
    ),
    lambda a, b, c, q: (
        f"A cuboid is {a} by {b} by {c} cm. Volume for box {q}?",
        [f"{a * b * c} cm3", f"{a + b + c} cm3", f"{a * b} cm3", f"{c} cm3"],
    ),
    lambda a, b, c, q: (
        f"Probability of drawing a red ball from {a} red and {b} blue in bag {q}?",
        [f"{a}/{a + b}", f"{b}/{a + b}", f"{c}/{a}", f"1/2"],
    ),
    lambda a, b, c, q: (
        f"A man spends {a}% of income Rs {b * 100}. Savings for month {q}?",
        [f"Rs {c}", f"Rs {a}", f"Rs {b}", f"Rs 0"],
    ),
    lambda a, b, c, q: (
        f"Downstream speed {a} km/h, upstream {b} km/h. Speed in still water for boat {q}?",
        [f"{(a + b) / 2} km/h", f"{c} km/h", f"{a} km/h", f"{b} km/h"],
    ),
    lambda a, b, c, q: (
        f"Discount of Rs {a} on marked price Rs {b * 10}. Discount percent for offer {q}?",
        [f"{c}%", f"{a}%", f"10%", f"25%"],
    ),
    lambda a, b, c, q: (
        f"Mean of {a} numbers is {b}. If one number {c} is excluded, new mean for list {q}?",
        [f"{b}", f"{a}", f"{c}", f"{a + b}"],
    ),
]

_ALG_STEMS = [
    lambda a, b, c, q: (
        f"Solve {a}x + {b} = {c}. Value of x for equation {q}?",
        [f"{(c - b) / a:.0f}" if a else "0", f"{a}", f"{b}", f"{c}"],
    ),
    lambda a, b, c, q: (
        f"If x:{b} = {a}:{c}, x equals which number in proportion {q}?",
        [f"{a * b // max(c, 1)}", f"{a}", f"{b}", f"{c}"],
    ),
    lambda a, b, c, q: (
        f"Roots of x^2 - {a}x + {b} = 0. Sum of roots for polynomial {q}?",
        [f"{a}", f"{b}", f"{c}", f"{a + b}"],
    ),
    lambda a, b, c, q: (
        f"Linear pair: 2x - y = {a} and x + y = {b}. y for system {q}?",
        [f"{c}", f"{a}", f"{b}", f"0"],
    ),
    lambda a, b, c, q: (
        f"If 3^{a} = {b}, log base 3 of {b} for identity {q}?",
        [f"{a}", f"{c}", f"{b}", f"1"],
    ),
    lambda a, b, c, q: (
        f"Factor {a}x^2 + {b}x + {c}. One linear factor for trinomial {q}?",
        [f"(x + 1)", f"(x - {a})", f"(2x + {b})", f"(x + {c})"],
    ),
    lambda a, b, c, q: (
        f"Arithmetic progression first term {a}, common difference {b}. 5th term for AP {q}?",
        [f"{a + 4 * b}", f"{c}", f"{a}", f"{b}"],
    ),
    lambda a, b, c, q: (
        f"Inequality: {a}x > {b}. Smallest integer x for constraint {q}?",
        [f"{c}", f"{a}", f"{b}", f"0"],
    ),
    lambda a, b, c, q: (
        f"Matrix 2x2 with entries {a},{b},{c},1. Determinant for matrix {q}?",
        [f"{a - b * c}", f"{a}", f"{b}", f"{c}"],
    ),
    lambda a, b, c, q: (
        f"If f(x) = {a}x + {b}, f({c}) for mapping {q}?",
        [f"{a * c + b}", f"{a}", f"{b}", f"{c}"],
    ),
]

_VOCAB_STEMS = [
    lambda a, b, c, q: (
        f"Choose the synonym of 'ephemeral' as used in the {q} editorial of {a} words.",
        ["fleeting", "eternal", f"verbose-{b}", f"opaque-{c}"],
    ),
    lambda a, b, c, q: (
        f"Identify the antonym of 'paucity' in passage {q} about {a} shortages.",
        ["abundance", "scarcity", f"drought-{b}", f"deficit-{c}"],
    ),
    lambda a, b, c, q: (
        f"Fill in: The committee {q} the motion after {a} hours of debate.",
        ["tabled", "table", f"tabling-{b}", f"tables-{c}"],
    ),
    lambda a, b, c, q: (
        f"One-word substitution for 'a person who hates people' in item {q} (hint: {a}).",
        ["misanthrope", "philanthropist", f"hermit-{b}", f"cynic-{c}"],
    ),
    lambda a, b, c, q: (
        f"Error spotting: 'Neither of the {a} reports were signed' in sentence {q}.",
        ["were → was", "Neither → None", f"reports → report-{b}", "no error"],
    ),
    lambda a, b, c, q: (
        f"Idiom: 'to bury the hatchet' in anecdote {q} involving {a} rivals means?",
        ["make peace", "start a fight", f"hide tools-{b}", f"resign-{c}"],
    ),
    lambda a, b, c, q: (
        f"Voice: change 'They elected her captain of {a}' to passive for item {q}.",
        ["She was elected captain", "She elected them", f"Captain was {b}", f"They {c}"],
    ),
    lambda a, b, c, q: (
        f"Preposition: 'He is good ___ mathematics' in drill {q} (class of {a}).",
        ["at", "in", f"on-{b}", f"with-{c}"],
    ),
    lambda a, b, c, q: (
        f"Para jumble: which sentence starts the {a}-line paragraph labelled {q}?",
        ["The census began at dawn.", "Therefore results followed.", f"Meanwhile {b}.", f"Finally {c}."],
    ),
    lambda a, b, c, q: (
        f"Spelling: which is correctly spelled in list {q} among {a} options?",
        ["accommodation", "acommodation", f"accomodation-{b}", f"acomodation-{c}"],
    ),
]


def _payload_for(qid: str, topic: str, subject: str) -> tuple[str, list[str], str]:
    n = _qid_n(qid)
    a, b, c = 11 + (n % 17), 3 + (n % 11), 19 + (n % 23)
    topic_l = topic.lower()
    subject_l = subject.lower()
    if "vocab" in topic_l or "english" in subject_l:
        stem, options = _VOCAB_STEMS[n % len(_VOCAB_STEMS)](a, b, c, qid)
    elif "algebra" in topic_l:
        stem, options = _ALG_STEMS[n % len(_ALG_STEMS)](a, b, c, qid)
    else:
        stem, options = _ARITH_STEMS[n % len(_ARITH_STEMS)](a, b, c, qid)
    # Quality scoring requires four distinct option texts.
    unique_options = [
        f"{options[0]} [A-{qid}]",
        f"{options[1]} [B-{qid}]",
        f"{options[2]} [C-{qid}]",
        f"{options[3]} [D-{qid}]",
    ]
    expl = (
        f"Worked solution unique to {qid}: using values {a}, {b}, {c} "
        f"the keyed option follows from the {topic} setup."
    )
    return stem, unique_options, expl


def _bank(qid: str, subject: str, topic: str, *, source_type: str = "approved_bank") -> BankQuestion:
    stem, options, expl = _payload_for(qid, topic, subject)
    return BankQuestion(
        id=qid,
        question_text=stem,
        options=options,
        correct_index=0,
        subject=subject,
        topic=topic,
        difficulty="MEDIUM",
        is_verified=True,
        source="PUBLIC_DOMAIN" if source_type == "verified_public_source" else "INTERNAL",
        source_type=source_type,
        explanation=expl,
        source_id=f"src-{qid}" if source_type == "official_verified" else None,
        source_document="PYQ 2023 booklet" if source_type == "official_verified" else None,
        source_year=2023 if source_type == "official_verified" else None,
    )


def _as_paper(item: BankQuestion, *, section_code: str = "quant") -> PaperQuestion:
    return PaperQuestion(
        question_text=item.question_text,
        options=item.options,
        correct_index=0,
        section_code=section_code,
        subject=item.subject,
        topic=item.topic,
        difficulty="MEDIUM",
        marks_positive=1.0,
        marks_negative=0.25,
        source_class="bank",
        source_type=item.source_type or "approved_bank",
        language="en",
        question_id=item.id,
        quality_score=80,
    )


def _tiny_blueprint(total: int = 5) -> PaperBlueprint:
    exam = _exam()
    pattern = PatternVersion(
        id="pattern-1",
        version="2024.1",
        total_questions=total,
        total_marks=float(total),
        duration_minutes=10,
        negative_mark=0.25,
        marks_per_question=1.0,
        sections=(
            PatternSection("quant", "Quantitative Aptitude", total, float(total), 1),
        ),
    )
    return build_blueprint(
        exam=exam,
        pattern=pattern,
        syllabus_topics={"quant": ["arithmetic", "algebra"]},
        language="en",
        mode="generated_mock",
        random_seed="seed-a",
        custom_question_count=total,
    )


def test_same_seed_same_blueprint() -> None:
    a = _tiny_blueprint(8)
    b = _tiny_blueprint(8)
    assert a.to_json()["slots"] == b.to_json()["slots"]
    assert a.total_questions == b.total_questions


def test_slot_fill_prefers_matching_topic_and_section() -> None:
    blueprint = _tiny_blueprint(4)
    bank = [
        _bank("q-arith-1", "Quantitative Aptitude", "arithmetic"),
        _bank("q-arith-2", "Quantitative Aptitude", "arithmetic"),
        _bank("q-alg-1", "Quantitative Aptitude", "algebra"),
        _bank("q-alg-2", "Quantitative Aptitude", "algebra"),
        _bank("q-eng-1", "English Comprehension", "vocabulary"),
    ]
    selected, leftovers = fill_bank_into_slots(bank, blueprint, mode="generated_mock")
    placed = [q for items in selected.values() for q in items]
    assert len(placed) == 4
    assert all(q.section_code == "quant" for q in placed)
    leftover_ids = {q.id for q in leftovers}
    assert "q-eng-1" in leftover_ids
    assert all(q.source_type == "approved_bank" for q in placed)


def test_leftover_fill_never_dumps_into_default_section() -> None:
    exam = _exam()
    blueprint = PaperBlueprint(
        exam=exam,
        pattern_version_id="p1",
        pattern_version="1",
        syllabus_version_id=None,
        syllabus_version=None,
        language="en",
        mode="generated_mock",
        paper_class="ai_generated",
        total_questions=4,
        total_marks=4.0,
        duration_minutes=10,
        negative_mark=0.25,
        marks_per_question=1.0,
        random_seed="seed",
        sections=(
            SectionBlueprint(
                code="quant",
                name="Quantitative Aptitude",
                question_count=2,
                marks=2.0,
                sort_order=1,
                topics=("arithmetic",),
                difficulty_counts=(("MEDIUM", 2),),
                topic_counts=(("arithmetic", 2),),
            ),
            SectionBlueprint(
                code="english",
                name="English Comprehension",
                question_count=2,
                marks=2.0,
                sort_order=2,
                topics=("vocabulary",),
                difficulty_counts=(("MEDIUM", 2),),
                topic_counts=(("vocabulary", 2),),
            ),
        ),
        slots=(
            GenerationSlot("quant", "Quantitative Aptitude", "arithmetic", "MEDIUM", 2),
            GenerationSlot("english", "English Comprehension", "vocabulary", "MEDIUM", 2),
        ),
    )
    questions = [
        PaperQuestion(
            question_text=_bank("q-q1", "Quantitative Aptitude", "arithmetic").question_text,
            options=_bank("q-q1", "Quantitative Aptitude", "arithmetic").options,
            correct_index=0,
            section_code="quant",
            subject="Quantitative Aptitude",
            topic="arithmetic",
            difficulty="MEDIUM",
            marks_positive=1.0,
            marks_negative=0.25,
            source_class="bank",
            source_type="approved_bank",
            language="en",
            question_id="q-q1",
            quality_score=80,
        )
    ]
    leftovers = [
        _bank("q-e1", "English Comprehension", "vocabulary"),
        _bank("q-e2", "English Comprehension", "vocabulary"),
        _bank("q-q2", "Quantitative Aptitude", "arithmetic"),
    ]
    filled, still = fill_leftovers_section_safe(
        blueprint, questions, leftovers, mode="generated_mock"
    )
    by_section: dict[str, int] = {}
    for q in filled:
        by_section[q.section_code] = by_section.get(q.section_code, 0) + 1
        assert q.section_code in {"quant", "english"}
    assert by_section.get("english", 0) == 2
    assert by_section.get("quant", 0) == 2
    assert len(filled) == 4


def test_repair_24_to_25_from_leftover_bank() -> None:
    blueprint = _tiny_blueprint(25)
    questions: list[PaperQuestion] = []
    leftovers: list[BankQuestion] = []
    for i in range(24):
        item = _bank(f"q-{i:04d}", "Quantitative Aptitude", "arithmetic")
        questions.append(
            PaperQuestion(
                question_text=item.question_text,
                options=item.options,
                correct_index=0,
                section_code="quant",
                subject=item.subject,
                topic=item.topic,
                difficulty="MEDIUM",
                marks_positive=1.0,
                marks_negative=0.25,
                source_class="bank",
                source_type="approved_bank",
                language="en",
                question_id=item.id,
                quality_score=80,
            )
        )
    leftovers.append(_bank("q-0024", "Quantitative Aptitude", "algebra"))
    filled, _ = fill_leftovers_section_safe(
        blueprint, questions, leftovers, mode="generated_mock"
    )
    assert len(filled) == 25
    assert filled[-1].section_code == "quant"
    assert filled[-1].question_id == "q-0024"


def test_repair_deterministic_when_bank_exhausted() -> None:
    blueprint = _tiny_blueprint(3)
    questions = [
        PaperQuestion(
            question_text=_bank("q-0", "Quantitative Aptitude", "arithmetic").question_text,
            options=_bank("q-0", "Quantitative Aptitude", "arithmetic").options,
            correct_index=0,
            section_code="quant",
            subject="Quantitative Aptitude",
            topic="arithmetic",
            difficulty="MEDIUM",
            marks_positive=1.0,
            marks_negative=0.25,
            source_class="bank",
            source_type="approved_bank",
            language="en",
            question_id="q-0",
            quality_score=80,
        )
    ]
    filled = fill_deterministic_shortfalls(blueprint, questions, seed="repair-seed")
    assert len(filled) == 3
    generated = [q for q in filled if q.python_generated]
    assert len(generated) == 2
    assert all(q.source_type == "generated_practice" for q in generated)
    assert all(q.source_id is None for q in generated)
    assert all(q.section_code == "quant" for q in filled)


def test_repair_paper_fills_24_to_25_from_leftover_bank() -> None:
    blueprint = _tiny_blueprint(25)
    questions = [
        _as_paper(_bank(f"q-{i:04d}", "Quantitative Aptitude", "arithmetic"))
        for i in range(24)
    ]
    leftovers = [_bank("q-0024", "Quantitative Aptitude", "algebra")]
    filled, still, det = repair_paper(
        blueprint,
        questions,
        leftovers,
        mode="generated_mock",
        allow_det=False,
        seed="seed-repair",
        max_rounds=2,
    )
    assert len(filled) == 25
    assert det == 0
    assert filled[-1].section_code == "quant"
    assert filled[-1].question_id == "q-0024"
    assert "q-0024" not in {item.id for item in still}


def test_repair_paper_fills_24_to_25_deterministic_when_allowed() -> None:
    blueprint = _tiny_blueprint(25)
    questions = [
        _as_paper(_bank(f"q-{i:04d}", "Quantitative Aptitude", "arithmetic"))
        for i in range(24)
    ]
    filled, still, det = repair_paper(
        blueprint,
        questions,
        leftovers=[],
        mode="generated_mock",
        allow_det=True,
        seed="seed-det-24",
        max_rounds=2,
    )
    assert len(filled) == 25
    assert det == 1
    assert still == []
    last = filled[-1]
    assert last.python_generated is True
    assert last.source_type == "generated_practice"
    assert last.section_code == "quant"
    assert last.source_id is None


def test_repair_paper_drops_rejected_then_fills_leftover() -> None:
    blueprint = _tiny_blueprint(3)
    questions = [
        _as_paper(_bank(f"q-{i}", "Quantitative Aptitude", "arithmetic"))
        for i in range(3)
    ]
    leftovers = [_bank("q-leftover", "Quantitative Aptitude", "algebra")]

    def reject_q2(qs: list[PaperQuestion]) -> set[int]:
        return {i for i, q in enumerate(qs) if q.question_id == "q-2"}

    filled, _still, det = repair_paper(
        blueprint,
        questions,
        leftovers,
        mode="generated_mock",
        allow_det=False,
        seed="seed-drop",
        max_rounds=3,
        validate_fn=reject_q2,
    )
    assert det == 0
    ids = [q.question_id for q in filled]
    assert "q-2" not in ids
    assert "q-leftover" in ids
    assert len(filled) == 3
    assert all(q.section_code == "quant" for q in filled)


def test_repair_paper_never_dumps_leftover_into_unmatched_section() -> None:
    exam = _exam()
    blueprint = PaperBlueprint(
        exam=exam,
        pattern_version_id="p1",
        pattern_version="1",
        syllabus_version_id=None,
        syllabus_version=None,
        language="en",
        mode="generated_mock",
        paper_class="ai_generated",
        total_questions=4,
        total_marks=4.0,
        duration_minutes=10,
        negative_mark=0.25,
        marks_per_question=1.0,
        random_seed="seed",
        sections=(
            SectionBlueprint(
                code="quant",
                name="Quantitative Aptitude",
                question_count=2,
                marks=2.0,
                sort_order=1,
                topics=("arithmetic",),
                difficulty_counts=(("MEDIUM", 2),),
                topic_counts=(("arithmetic", 2),),
            ),
            SectionBlueprint(
                code="english",
                name="English Comprehension",
                question_count=2,
                marks=2.0,
                sort_order=2,
                topics=("vocabulary",),
                difficulty_counts=(("MEDIUM", 2),),
                topic_counts=(("vocabulary", 2),),
            ),
        ),
        slots=(
            GenerationSlot("quant", "Quantitative Aptitude", "arithmetic", "MEDIUM", 2),
            GenerationSlot("english", "English Comprehension", "vocabulary", "MEDIUM", 2),
        ),
    )
    questions = [_as_paper(_bank("q-q1", "Quantitative Aptitude", "arithmetic"))]
    leftovers = [
        _bank("q-e1", "English Comprehension", "vocabulary"),
        _bank("q-e2", "English Comprehension", "vocabulary"),
        _bank("q-q2", "Quantitative Aptitude", "arithmetic"),
    ]
    filled, still, det = repair_paper(
        blueprint,
        questions,
        leftovers,
        mode="generated_mock",
        allow_det=False,
        seed="seed",
        max_rounds=2,
    )
    assert det == 0
    by_section: dict[str, int] = {}
    for q in filled:
        by_section[q.section_code] = by_section.get(q.section_code, 0) + 1
        assert q.section_code in {"quant", "english"}
    assert by_section.get("english", 0) == 2
    assert by_section.get("quant", 0) == 2
    assert len(filled) == 4
    english_ids = {q.question_id for q in filled if q.section_code == "english"}
    assert english_ids == {"q-e1", "q-e2"}
    assert still == []


def test_official_mode_rejects_generated_bank_rows() -> None:
    blueprint = _tiny_blueprint(2)
    bank = [
        _bank("q-gen", "Quantitative Aptitude", "arithmetic", source_type="ai_generated_practice"),
        _bank("q-ok", "Quantitative Aptitude", "algebra", source_type="official_verified"),
        _bank("q-approved", "Quantitative Aptitude", "arithmetic", source_type="approved_bank"),
    ]
    selected, leftovers = fill_bank_into_slots(bank, blueprint, mode="official_previous")
    placed = [q for items in selected.values() for q in items]
    assert {q.question_id for q in placed} == {"q-ok"}
    assert all(q.source_type == "official_verified" for q in placed)
    assert "q-gen" in {q.id for q in leftovers}
    assert "q-approved" in {q.id for q in leftovers}


def test_granular_source_mix_and_label() -> None:
    mix = summarize_source_mix(
        [
            "official_verified",
            "official_verified",
            "verified_public_source",
            "approved_bank",
            "generated_practice",
            "ai_generated_practice",
        ]
    )
    assert mix["official_verified"] == 2
    assert mix["verified_public_source"] == 1
    assert mix["approved_bank"] == 1
    assert mix["generated_practice"] == 1
    assert mix["ai_generated_practice"] == 1
    assert resolve_paper_source(mix, mode="generated_mock") == "hybrid_realistic_mock"
    assert resolve_paper_source(mix, mode="official_previous") == "official_verified"


def test_process_job_ack_is_not_success_without_paper() -> None:
    ack = ProcessJobResponse(
        success=False,
        accepted=True,
        job_id="job-1",
        status="leased",
    )
    assert ack.success is False
    assert ack.accepted is True
    assert ack.paper_id is None
    completed = ProcessJobResponse(
        success=True,
        accepted=True,
        job_id="job-1",
        status="completed",
        paper_id="paper-1",
        question_count=25,
        marks=50,
        negative_marking=0.5,
        duration=60,
        language="en",
        blueprint_version="gov_paper_v1",
        validation_result="passed",
        source_mix={"approved_bank": 25},
    )
    assert completed.success is True
    assert completed.paper_id == "paper-1"
    assert completed.validation_result == "passed"


def test_near_duplicate_pair_cannot_both_sit_on_paper() -> None:
    blueprint = _tiny_blueprint(2)
    stem = "Which of the following statements about arithmetic item 0001 is correct?"
    options = ["Option A for arithmetic 0001", "Option B", "Option C", "Option D extra"]
    questions = [
        PaperQuestion(
            question_text=stem,
            options=options,
            correct_index=0,
            section_code="quant",
            subject="Quantitative Aptitude",
            topic="arithmetic",
            difficulty="MEDIUM",
            marks_positive=1.0,
            marks_negative=0.25,
            source_class="bank",
            source_type="approved_bank",
            language="en",
            question_id="dup-1",
            quality_score=80,
        ),
        PaperQuestion(
            question_text=stem,
            options=options,
            correct_index=0,
            section_code="quant",
            subject="Quantitative Aptitude",
            topic="arithmetic",
            difficulty="MEDIUM",
            marks_positive=1.0,
            marks_negative=0.25,
            source_class="bank",
            source_type="approved_bank",
            language="en",
            question_id="dup-2",
            quality_score=80,
        ),
    ]
    errors = validate_assembled_paper(blueprint, questions)
    assert any("duplicate" in e.lower() for e in errors)


def test_engine_official_empty_bank_is_content_insufficient() -> None:
    blueprint = _tiny_blueprint(5)
    settings = MagicMock()
    settings.has_ai_provider = False
    settings.batch_size = 4
    settings.max_repair_rounds = 1
    settings.system_user_id = ""
    repo = MagicMock()
    repo.set_stage = MagicMock()
    repo.save_blueprint = MagicMock()
    repo.heartbeat = MagicMock()
    repo.fail_job = MagicMock()
    job = {
        "id": "11111111-1111-1111-1111-111111111111",
        "exam_id": blueprint.exam.exam_id,
        "stage_id": blueprint.exam.stage_id,
        "user_id": "22222222-2222-2222-2222-222222222222",
        "mode": "official_previous",
        "language": "en",
        "random_seed": "seed",
        "status": "queued",
        "request_json": {
            "questionCount": 5,
            "allowAiFill": False,
            "allowDeterministicFill": False,
        },
    }

    with patch.object(PaperFactory, "plan", AsyncMock(return_value=blueprint)):
        with patch("app.gov_exams.engine.load_eligible_bank", return_value=([], ["TEST"])):
            result = asyncio.run(
                process_gov_exam_job(job, settings=settings, repo=repo)
            )
    assert result.success is False
    assert result.error_code == "CONTENT_INSUFFICIENT"
    assert result.paper_id is None
    repo.fail_job.assert_called()


def test_engine_assembles_valid_paper_from_bank() -> None:
    blueprint = _tiny_blueprint(5)
    bank_rows = [
        _bank(f"q-{i:04d}", "Quantitative Aptitude", "arithmetic" if i % 2 == 0 else "algebra")
        for i in range(8)
    ]
    settings = MagicMock()
    settings.has_ai_provider = False
    settings.batch_size = 4
    settings.max_repair_rounds = 2
    settings.system_user_id = ""
    repo = MagicMock()
    repo.set_stage = MagicMock()
    repo.save_blueprint = MagicMock()
    repo.heartbeat = MagicMock()
    repo.publish_paper = MagicMock(return_value=("paper-1", "mock-1"))
    repo.complete_job = MagicMock()
    repo.patch_job_source_mix = MagicMock()
    repo.insert_questions = MagicMock(return_value=[])
    repo.fail_job = MagicMock()

    class _Eligible:
        def __init__(self, b: BankQuestion) -> None:
            self.id = b.id
            self.question_text = b.question_text
            self.options = b.options
            self.correct_index = b.correct_index
            self.subject = b.subject
            self.topic = b.topic
            self.difficulty = b.difficulty
            self.is_verified = b.is_verified
            self.source = b.source
            self.source_type = b.source_type
            self.explanation = b.explanation
            self.source_id = b.source_id
            self.source_document = b.source_document
            self.source_page = None
            self.source_year = b.source_year
            self.ingestion_job_id = None
            self.python_generated = False
            self.metadata = None

    eligible = [_Eligible(b) for b in bank_rows]
    job = {
        "id": "33333333-3333-3333-3333-333333333333",
        "exam_id": blueprint.exam.exam_id,
        "stage_id": blueprint.exam.stage_id,
        "user_id": "44444444-4444-4444-4444-444444444444",
        "mode": "generated_mock",
        "language": "en",
        "random_seed": "seed",
        "status": "queued",
        "request_json": {
            "questionCount": 5,
            "allowAiFill": False,
            "allowDeterministicFill": True,
        },
    }

    with patch.object(PaperFactory, "plan", AsyncMock(return_value=blueprint)):
        with patch(
            "app.gov_exams.engine.load_eligible_bank",
            return_value=(eligible, ["TEST"]),
        ):
            result = asyncio.run(
                process_gov_exam_job(job, settings=settings, repo=repo)
            )

    assert result.success is True
    assert result.paper_id == "paper-1"
    assert result.mock_test_id == "mock-1"
    assert result.question_count == 5
    assert result.marks == 5.0
    assert result.negative_marking == 0.25
    assert result.duration == 10
    assert result.language == "en"
    assert result.validation_result == "passed"
    assert result.source_mix
    repo.publish_paper.assert_called_once()
    published_questions = repo.publish_paper.call_args.kwargs["questions"]
    assert len(published_questions) == 5
    assert {q.section_code for q in published_questions} == {"quant"}
    mix = repo.publish_paper.call_args.kwargs["source_mix"]
    assert "generated_practice" in mix or "approved_bank" in mix or "official_verified" in mix
    provenance = repo.publish_paper.call_args.kwargs["provenance"]
    assert provenance["source_mix"]
    for q in published_questions:
        assert q.question_source_type in {
            "official_verified",
            "verified_public_source",
            "approved_bank",
            "generated_practice",
            "ai_generated_practice",
        }
        if q.generated_practice or q.python_generated or q.ai_generated:
            assert q.source_type in {"generated_practice", "ai_generated_practice"}
            assert q.source_id is None
            assert q.source_document is None
            assert q.source_year is None
    repo.complete_job.assert_called_once()
    repo.fail_job.assert_not_called()
    stages = [call.args[1] for call in repo.set_stage.call_args_list]
    assert stages[0] == "checking_availability"
    assert "validating" not in stages
    assert "validating_questions" in stages


def test_engine_does_not_call_ai_when_bank_covers_the_paper() -> None:
    """Full approved bank must not open the AI generator."""
    blueprint = _tiny_blueprint(5)
    bank_rows = [
        _bank(f"q-{i:04d}", "Quantitative Aptitude", "arithmetic" if i % 2 == 0 else "algebra")
        for i in range(8)
    ]
    settings = MagicMock()
    settings.has_ai_provider = True
    settings.batch_size = 4
    settings.max_repair_rounds = 2
    settings.system_user_id = ""
    repo = MagicMock()
    repo.set_stage = MagicMock()
    repo.save_blueprint = MagicMock()
    repo.heartbeat = MagicMock()
    repo.publish_paper = MagicMock(return_value=("paper-1", "mock-1"))
    repo.complete_job = MagicMock()
    repo.patch_job_source_mix = MagicMock()
    repo.insert_questions = MagicMock(return_value=[])
    repo.fail_job = MagicMock()

    class _Eligible:
        def __init__(self, b: BankQuestion) -> None:
            self.id = b.id
            self.question_text = b.question_text
            self.options = b.options
            self.correct_index = b.correct_index
            self.subject = b.subject
            self.topic = b.topic
            self.difficulty = b.difficulty
            self.is_verified = b.is_verified
            self.source = b.source
            self.source_type = b.source_type
            self.explanation = b.explanation
            self.source_id = b.source_id
            self.source_document = b.source_document
            self.source_page = None
            self.source_year = b.source_year
            self.ingestion_job_id = None
            self.python_generated = False
            self.metadata = None

    eligible = [_Eligible(b) for b in bank_rows]
    job = {
        "id": "55555555-5555-5555-5555-555555555555",
        "exam_id": blueprint.exam.exam_id,
        "stage_id": blueprint.exam.stage_id,
        "user_id": "66666666-6666-6666-6666-666666666666",
        "mode": "generated_mock",
        "language": "en",
        "random_seed": "seed",
        "status": "queued",
        "request_json": {
            "questionCount": 5,
            "allowAiFill": True,
            "allowDeterministicFill": True,
        },
    }

    def boom(*_a, **_k):
        raise AssertionError("AI generator must not run when the bank already covers the paper")

    with patch.object(PaperFactory, "plan", AsyncMock(return_value=blueprint)):
        with patch(
            "app.gov_exams.engine.load_eligible_bank",
            return_value=(eligible, ["TEST"]),
        ):
            with patch("app.gov_exams.engine.MCQGenerator", boom):
                result = asyncio.run(
                    process_gov_exam_job(job, settings=settings, repo=repo)
                )

    assert result.success is True
    assert result.paper_id == "paper-1"
    stages = [call.args[1] for call in repo.set_stage.call_args_list]
    assert "generating_missing_slots" not in stages


def test_engine_official_previous_never_constructs_mcq_generator() -> None:
    """Official PYQ mode must not open MCQGenerator even if AI fill is requested."""
    blueprint = _tiny_blueprint(5)
    settings = MagicMock()
    settings.has_ai_provider = True
    settings.batch_size = 4
    settings.max_repair_rounds = 1
    settings.system_user_id = ""
    repo = MagicMock()
    repo.set_stage = MagicMock()
    repo.save_blueprint = MagicMock()
    repo.heartbeat = MagicMock()
    repo.fail_job = MagicMock()
    job = {
        "id": "77777777-7777-7777-7777-777777777777",
        "exam_id": blueprint.exam.exam_id,
        "stage_id": blueprint.exam.stage_id,
        "user_id": "88888888-8888-8888-8888-888888888888",
        "mode": "official_previous",
        "language": "en",
        "random_seed": "seed",
        "status": "queued",
        "request_json": {
            "questionCount": 5,
            "allowAiFill": True,
            "allowDeterministicFill": True,
        },
    }

    def boom(*_a, **_k):
        raise AssertionError("official_previous must never construct MCQGenerator")

    with patch.object(PaperFactory, "plan", AsyncMock(return_value=blueprint)):
        with patch("app.gov_exams.engine.load_eligible_bank", return_value=([], ["TEST"])):
            with patch("app.gov_exams.engine.MCQGenerator", boom):
                result = asyncio.run(
                    process_gov_exam_job(job, settings=settings, repo=repo)
                )
    assert result.success is False
    assert result.error_code == "CONTENT_INSUFFICIENT"
    assert result.paper_id is None
    repo.fail_job.assert_called()


def test_ai_generation_started_logs_policy_not_prompts() -> None:
    from app.ai_policy import FEATURE_POLICIES
    from app.paper_factory.ai import AIResponse

    blueprint = _tiny_blueprint(5)
    settings = MagicMock()
    settings.has_ai_provider = True
    settings.batch_size = 4
    settings.max_repair_rounds = 1
    settings.system_user_id = ""
    repo = MagicMock()
    repo.set_stage = MagicMock()
    repo.save_blueprint = MagicMock()
    repo.heartbeat = MagicMock()
    repo.fail_job = MagicMock()

    class _StubGen:
        def __init__(self, *_a, **_k) -> None:
            self.call_count = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return None

        async def generate(self, prompt, **_k):
            assert isinstance(prompt, str)
            return AIResponse("gemini", "stub", [])

    logged: list[tuple[str, dict]] = []

    def capture(event, **fields):
        logged.append((event, fields))

    job = {
        "id": "99999999-9999-9999-9999-999999999999",
        "exam_id": blueprint.exam.exam_id,
        "stage_id": blueprint.exam.stage_id,
        "user_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "mode": "generated_mock",
        "language": "en",
        "random_seed": "seed",
        "status": "queued",
        "request_json": {
            "questionCount": 5,
            "allowAiFill": True,
            "allowDeterministicFill": False,
        },
    }

    with patch.object(PaperFactory, "plan", AsyncMock(return_value=blueprint)):
        with patch("app.gov_exams.engine.load_eligible_bank", return_value=([], ["TEST"])):
            with patch("app.gov_exams.engine.MCQGenerator", _StubGen):
                with patch("app.gov_exams.engine.gov_exam_log", side_effect=capture):
                    result = asyncio.run(
                        process_gov_exam_job(job, settings=settings, repo=repo)
                    )

    assert result.success is False
    started = [fields for event, fields in logged if event == "ai_generation_started"]
    assert started
    payload = started[0]
    policy = FEATURE_POLICIES["gov_exam_gap_fill"]
    assert payload["needed"] == 5
    assert payload["prompt_version"] == policy.prompt_version
    assert payload["decision"] == "AI_REQUIRED"
    assert "user_id" not in payload
    assert job["user_id"] not in str(payload)
    assert "prompt" not in payload


def test_match_bank_to_sections_reexported() -> None:
    blueprint = _tiny_blueprint(2)
    bank = [_bank("q-1", "Quantitative Aptitude", "arithmetic")]
    buckets = match_bank_to_sections(bank, blueprint)
    assert "quant" in buckets
    assert buckets["quant"][0].id == "q-1"


def test_generated_provenance_never_looks_official() -> None:
    sid, doc, page, year, job = strip_generated_provenance(
        generated=True,
        source_id="src-1",
        source_document="PYQ 2023 booklet",
        source_page=12,
        source_year=2023,
        ingestion_job_id="job-9",
    )
    assert sid is None
    assert doc is None
    assert page is None
    assert year is None
    assert job is None
    kept = strip_generated_provenance(
        generated=False,
        source_id="src-1",
        source_document="PYQ 2023 booklet",
        source_page=12,
        source_year=2023,
        ingestion_job_id="job-9",
    )
    assert kept == ("src-1", "PYQ 2023 booklet", 12, 2023, "job-9")


def test_process_job_route_ack_is_not_success() -> None:
    import inspect

    from app.routes import gov_exams as gov_routes

    source = inspect.getsource(gov_routes.process_job)
    assert "success=False" in source
    assert "accepted=True" in source


def test_build_paper_mix_keeps_official_and_verified_tiers() -> None:
    from app.gov_exams.schemas import paper_mix_from_result

    mix = paper_mix_from_result(
        ProcessJobResponse(
            success=True,
            job_id="job-1",
            status="completed",
            paper_id="paper-1",
            bank_count=18,
            ai_count=0,
            deterministic_count=0,
            source_mix={
                "official_verified": 10,
                "verified_public_source": 5,
                "approved_bank": 3,
            },
        )
    )
    assert mix["official_verified"] == 10
    assert mix["verified_public_source"] == 5
    assert mix["approved_bank"] == 3
    assert "ai_generated_practice" not in mix

