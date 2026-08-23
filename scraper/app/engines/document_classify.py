"""Heuristic document type classification (deterministic, no AI inference)."""

from __future__ import annotations

import re
from typing import Literal

DocumentType = Literal[
    "RESUME",
    "JOB_DESCRIPTION",
    "PERSONAL_DOCUMENT",
    "UNRELATED",
    "UNKNOWN_REVIEW",
]

_RECEIPT = re.compile(
    r"\b(receipt|invoice|subtotal|sales\s+tax|vat|qty|quantity|"
    r"payment\s+method|cashier|total\s+due|merchant\s+copy|"
    r"thank\s+you\s+for\s+your\s+purchase|itemized)\b",
    re.I,
)
_REPORT = re.compile(
    r"\b(abstract|methodology|literature\s+review|"
    r"references|bibliography|figure\s+\d+|table\s+of\s+contents|"
    r"executive\s+summary|quarterly\s+report|annual\s+report)\b",
    re.I,
)
_CONTACT = re.compile(
    r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|"
    r"(?<!\d)(?:\+?\d[\d ().-]{7,}\d)(?!\d)|"
    r"\blinkedin\b|\bgithub\b|\bportfolio\b",
    re.I,
)
_RESUME_SECTION = re.compile(
    r"\b(experience|employment|work\s+history|skills|projects|"
    r"education|certifications|achievements|summary|objective|"
    r"professional\s+profile)\b",
    re.I,
)
_JD_SECTION = re.compile(
    r"\b(responsibilities|qualifications|requirements|"
    r"what\s+you(?:'ll|\s+will)\s+do|what\s+we(?:'re|\s+are)\s+looking\s+for|"
    r"job\s+description|apply\s+now|about\s+the\s+role|"
    r"required\s+skills|preferred\s+qualifications)\b",
    re.I,
)
_ROLE_TITLE = re.compile(
    r"\b(engineer|developer|manager|analyst|designer|architect|"
    r"intern|specialist|consultant|director|lead)\b",
    re.I,
)


def _score_signals(text: str, pattern: re.Pattern[str]) -> int:
    return len(pattern.findall(text))


def classify_document_text(
    text: str,
    *,
    category_hint: str | None = None,
) -> tuple[DocumentType, float, list[str]]:
    """Classify document text using weighted heuristics."""
    warnings: list[str] = []
    normalized = text.strip()
    if not normalized:
        return "UNKNOWN_REVIEW", 0.0, ["empty_text"]

    lowered_hint = (category_hint or "").casefold()
    if lowered_hint in {"resume", "resume_pdf", "cv"}:
        return "RESUME", 0.85, ["category_hint_resume"]
    if lowered_hint in {"job_description", "jd", "job"}:
        return "JOB_DESCRIPTION", 0.85, ["category_hint_job_description"]

    receipt_score = _score_signals(normalized, _RECEIPT)
    report_score = _score_signals(normalized, _REPORT)
    contact_score = _score_signals(normalized, _CONTACT)
    resume_section_score = _score_signals(normalized, _RESUME_SECTION)
    jd_section_score = _score_signals(normalized, _JD_SECTION)
    role_score = _score_signals(normalized, _ROLE_TITLE)

    if receipt_score >= 2:
        return "UNRELATED", min(0.95, 0.5 + receipt_score * 0.1), ["receipt_like_content"]

    if report_score >= 2 and resume_section_score == 0 and jd_section_score == 0:
        return "UNRELATED", min(0.9, 0.45 + report_score * 0.1), ["report_like_content"]

    resume_signals = sum(
        bool(score)
        for score in (
            contact_score,
            resume_section_score >= 2,
            role_score and resume_section_score,
        )
    )
    jd_signals = sum(
        bool(score)
        for score in (
            jd_section_score >= 2,
            role_score and jd_section_score,
            _score_signals(normalized, re.compile(r"\b(company|employer|organization)\s*:", re.I)),
        )
    )

    if resume_signals >= 2 and resume_signals >= jd_signals:
        confidence = min(0.95, 0.35 + resume_signals * 0.15 + resume_section_score * 0.05)
        if contact_score == 0:
            warnings.append("no_contact_signals")
        return "RESUME", round(confidence, 3), warnings

    if jd_signals >= 2 and jd_signals > resume_signals:
        confidence = min(0.95, 0.35 + jd_signals * 0.15 + jd_section_score * 0.05)
        return "JOB_DESCRIPTION", round(confidence, 3), warnings

    if contact_score or resume_section_score or jd_section_score:
        if contact_score and resume_section_score:
            return "PERSONAL_DOCUMENT", 0.55, ["partial_resume_signals"]
        return "UNKNOWN_REVIEW", 0.45, ["ambiguous_document_signals"]

    return "UNRELATED", 0.4, ["no_recognized_document_signals"]
