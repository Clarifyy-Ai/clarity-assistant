"""Answer-key mapping never guesses missing or conflicting letters."""
from app.models.schemas import ParsedQuestion
from app.scraper.answer_map import apply_answer_map, parse_answer_grid


def _q(stem: str) -> ParsedQuestion:
    return ParsedQuestion(
        question_text=stem,
        options=[
            {"label": "A", "text": "one"},
            {"label": "B", "text": "two"},
            {"label": "C", "text": "three"},
            {"label": "D", "text": "four"},
        ],
    )


def test_parse_answer_grid_clean_map() -> None:
    mapped, conflicts = parse_answer_grid("1.(b)  2 (c)  3.(a)")
    assert mapped == {1: "B", 2: "C", 3: "A"}
    assert conflicts == set()


def test_parse_answer_grid_drops_conflicting_numbers() -> None:
    mapped, conflicts = parse_answer_grid("1.(b)  1.(c)  2.(a)")
    assert 1 in conflicts
    assert 1 not in mapped
    assert mapped[2] == "A"


def test_apply_answer_map_leaves_uncertain_blank() -> None:
    questions = [_q("Q1"), _q("Q2"), _q("Q3")]
    mapped, conflicts = parse_answer_grid("1.(b)  2.(a)  2.(d)")
    matched, partial = apply_answer_map(questions, mapped, conflicts)
    assert matched == 1
    assert partial is True
    assert questions[0].correct_answer == "B"
    assert questions[1].correct_answer is None
    assert questions[2].correct_answer is None
