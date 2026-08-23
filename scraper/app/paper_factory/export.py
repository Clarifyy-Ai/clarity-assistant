"""Export a generated paper as structured JSON and a printable HTML paper.

HTML is used rather than a PDF library so Devanagari and other Indic scripts render with
system fonts; the browser's "Print to PDF" produces the final printable paper.
"""
from __future__ import annotations

import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.paper_factory.models import PaperResult

_STYLE = """
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { font-family: 'Segoe UI', Roboto, 'Noto Sans', 'Nirmala UI', sans-serif;
       margin: 0 auto; max-width: 860px; padding: 32px 24px 64px; color: #111827;
       line-height: 1.55; }
header { border-bottom: 3px solid #111827; padding-bottom: 16px; margin-bottom: 24px; }
h1 { font-size: 22px; margin: 0 0 6px; }
.meta { display: flex; flex-wrap: wrap; gap: 8px 24px; font-size: 13px; color: #374151; }
.meta strong { color: #111827; }
.disclaimer { margin: 18px 0 28px; padding: 12px 14px; border-left: 4px solid #b45309;
              background: #fffbeb; font-size: 13px; color: #78350f; border-radius: 4px; }
.section-title { margin: 32px 0 12px; padding: 8px 12px; background: #f3f4f6;
                 border-radius: 4px; font-size: 15px; font-weight: 700;
                 display: flex; justify-content: space-between; }
.q { margin: 0 0 18px; padding: 0 0 14px; border-bottom: 1px solid #f3f4f6;
     page-break-inside: avoid; }
.q-head { display: flex; gap: 10px; font-weight: 600; }
.q-num { min-width: 34px; color: #6b7280; }
.opts { list-style: none; margin: 8px 0 0 44px; padding: 0; }
.opts li { margin: 4px 0; font-size: 14px; }
.tag { font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
       color: #6b7280; margin-left: 44px; }
.key { margin-top: 40px; page-break-before: always; }
.key table { width: 100%; border-collapse: collapse; font-size: 13px; }
.key th, .key td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
.key th { background: #f9fafb; }
.sol { margin: 14px 0; font-size: 13px; }
.sol .ans { font-weight: 700; color: #047857; }
@media print { body { padding: 0; max-width: none; } .disclaimer { break-inside: avoid; } }
"""


def to_dict(result: PaperResult) -> dict[str, Any]:
    """Full machine-readable export including the answer key."""
    blueprint = result.blueprint
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "exam": {
            "id": blueprint.exam.exam_id,
            "code": blueprint.exam.code,
            "name": blueprint.exam.name,
            "stage": blueprint.exam.stage_name,
        },
        "paper": {
            "paper_id": result.paper_id,
            "mock_test_id": result.mock_test_id,
            "title": f"{blueprint.exam.prompt_label} — AI Mock Paper",
            "paper_class": blueprint.paper_class,
            "language": blueprint.language,
            "question_count": len(result.questions),
            "total_marks": blueprint.total_marks,
            "duration_minutes": blueprint.duration_minutes,
            "marks_per_question": blueprint.marks_per_question,
            "negative_mark": blueprint.negative_mark,
            "disclaimer": blueprint.label,
        },
        "blueprint": blueprint.to_json(),
        "provenance": result.provenance_json(),
        "quality_score": result.quality_score,
        "questions": [
            {
                "number": index,
                "question_id": question.question_id,
                "section_code": question.section_code,
                "subject": question.subject,
                "topic": question.topic,
                "difficulty": question.difficulty,
                "source_class": question.source_class,
                "question_text": question.question_text,
                "options": question.options_json(),
                "correct_answer": question.correct_answer_letter,
                "explanation": question.explanation,
                "marks_positive": question.marks_positive,
                "marks_negative": question.marks_negative,
                "quality_score": question.quality_score,
            }
            for index, question in enumerate(result.questions, start=1)
        ],
    }


def to_html(result: PaperResult) -> str:
    """Printable question paper followed by the answer key and solutions."""
    blueprint = result.blueprint
    esc = html.escape
    title = f"{blueprint.exam.prompt_label} — AI Mock Paper"

    parts: list[str] = [
        "<!doctype html>",
        '<html lang="en"><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f"<title>{esc(title)}</title><style>{_STYLE}</style></head><body>",
        "<header>",
        f"<h1>{esc(title)}</h1>",
        '<div class="meta">',
        f"<span><strong>Questions:</strong> {len(result.questions)}</span>",
        f"<span><strong>Maximum marks:</strong> {blueprint.total_marks:g}</span>",
        f"<span><strong>Duration:</strong> {blueprint.duration_minutes} minutes</span>",
        f"<span><strong>Marking:</strong> +{blueprint.marks_per_question:g}"
        f" / -{blueprint.negative_mark:g}</span>",
        f"<span><strong>Language:</strong> {esc(blueprint.language)}</span>",
        "</div></header>",
        f'<p class="disclaimer">{esc(blueprint.label)}</p>',
    ]

    number = 0
    for section in sorted(blueprint.sections, key=lambda s: s.sort_order):
        section_questions = [
            q for q in result.questions if q.section_code == section.code
        ]
        if not section_questions:
            continue
        parts.append(
            f'<div class="section-title"><span>{esc(section.name)}</span>'
            f"<span>{len(section_questions)} questions</span></div>"
        )
        for question in section_questions:
            number += 1
            options = "".join(
                f"<li>({chr(65 + i)}) {esc(text)}</li>"
                for i, text in enumerate(question.options)
            )
            parts.append(
                '<div class="q">'
                f'<div class="q-head"><span class="q-num">{number}.</span>'
                f"<span>{esc(question.question_text)}</span></div>"
                f'<ol class="opts">{options}</ol>'
                f'<div class="tag">{esc(question.topic)} · {esc(question.difficulty)}</div>'
                "</div>"
            )

    rows = "".join(
        f"<tr><td>{index}</td><td>{q.correct_answer_letter}</td>"
        f"<td>{esc(q.topic)}</td><td>{esc(q.difficulty)}</td></tr>"
        for index, q in enumerate(result.questions, start=1)
    )
    parts.append(
        '<div class="key"><h1>Answer Key</h1>'
        "<table><thead><tr><th>Q</th><th>Answer</th><th>Topic</th>"
        "<th>Difficulty</th></tr></thead>"
        f"<tbody>{rows}</tbody></table>"
    )

    parts.append("<h1>Solutions</h1>")
    for index, question in enumerate(result.questions, start=1):
        explanation = esc(question.explanation) if question.explanation else "&mdash;"
        parts.append(
            f'<div class="sol"><strong>{index}.</strong> '
            f'<span class="ans">Answer: {question.correct_answer_letter}</span> '
            f"&mdash; {explanation}</div>"
        )
    parts.append("</div></body></html>")
    return "".join(parts)


def write_exports(result: PaperResult, out_dir: str | Path) -> dict[str, str]:
    """Write `<slug>.json` and `<slug>.html` into `out_dir`."""
    directory = Path(out_dir)
    directory.mkdir(parents=True, exist_ok=True)

    blueprint = result.blueprint
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    stage = (blueprint.exam.stage_code or "paper").lower().replace(" ", "-")
    slug = f"{blueprint.exam.code.lower()}-{stage}-{blueprint.language}-{stamp}"

    json_path = directory / f"{slug}.json"
    html_path = directory / f"{slug}.html"
    json_path.write_text(
        json.dumps(to_dict(result), ensure_ascii=False, indent=2), encoding="utf-8"
    )
    html_path.write_text(to_html(result), encoding="utf-8")
    return {"json": str(json_path), "html": str(html_path)}
