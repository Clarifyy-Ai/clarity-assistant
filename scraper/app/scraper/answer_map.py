"""Official answer-key grid parsing. Never guess a missing or conflicting letter."""
from __future__ import annotations

import re

from app.models.schemas import ParsedQuestion

# Answer key grid: `1.(b)`  `2 (c)` etc.
ANSWER_GRID_RE = re.compile(
    r"(\d{1,3})\s*[.\)]?\s*\(?\s*([abcdABCD])\s*\)?", re.MULTILINE
)


def parse_answer_grid(text: str) -> tuple[dict[int, str], set[int]]:
    """Parse a numbered A–D grid.

    Returns (clean_map, conflicting_numbers). A number that appears with two
    different letters is omitted from the map — never first-wins.
    """
    seen: dict[int, str] = {}
    conflicts: set[int] = set()
    for num, letter in ANSWER_GRID_RE.findall(text or ""):
        try:
            n = int(num)
        except ValueError:
            continue
        if not 1 <= n <= 300:
            continue
        value = letter.upper()
        if n in conflicts:
            continue
        if n in seen and seen[n] != value:
            conflicts.add(n)
            del seen[n]
            continue
        if n not in seen:
            seen[n] = value
    return seen, conflicts


def apply_answer_map(
    questions: list[ParsedQuestion],
    answer_map: dict[int, str],
    conflicts: set[int] | None = None,
) -> tuple[int, bool]:
    """Attach clean keys only. Returns (matched_count, answers_partial)."""
    matched = 0
    for idx, question in enumerate(questions, start=1):
        if idx in (conflicts or set()):
            continue
        letter = answer_map.get(idx)
        if letter in {"A", "B", "C", "D"}:
            question.correct_answer = letter  # type: ignore[assignment]
            matched += 1
    partial = matched < len(questions) or bool(conflicts)
    return matched, partial
