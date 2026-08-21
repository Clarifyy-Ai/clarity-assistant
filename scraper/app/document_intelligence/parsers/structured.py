from __future__ import annotations

import re

from app.document_intelligence.parsers.models import (
    ExperienceEntry,
    JobDescriptionResult,
    ParsedDocument,
    ParseWarning,
    ResumeResult,
)
from app.document_intelligence.parsers.normalize import clean_item, section_lines, unique_items

EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
PHONE = re.compile(r"(?<!\d)(?:\+?\d[\d ().-]{7,}\d)(?!\d)")
URL = re.compile(r"https?://\S+", re.I)
SENIORITY = re.compile(r"\b(intern|junior|mid[- ]level|senior|lead|principal|staff|director|manager|head|executive)\b", re.I)

RESUME_ALIASES = {
    "summary": {"summary", "profile", "objective", "professional summary"},
    "skills": {"skills", "technical skills", "core skills", "technologies"},
    "experience": {"experience", "work experience", "employment history"},
    "projects": {"projects", "personal projects", "key projects"},
    "education": {"education", "academic background"},
    "certifications": {"certifications", "licenses"},
    "achievements": {"achievements", "awards", "honors"},
    "languages": {"languages", "language skills"},
}

JD_ALIASES = {
    "responsibilities": {"responsibilities", "what you'll do", "duties"},
    "qualifications": {"qualifications", "requirements", "what we're looking for"},
    "preferred": {"preferred qualifications", "nice to have", "preferred skills"},
    "experience": {"experience", "years of experience"},
    "education": {"education", "educational requirements"},
    "skills": {"skills", "technical skills", "required skills"},
    "competencies": {"competencies", "interview competencies"},
}


def _source_pages(document: ParsedDocument, value: str) -> list[int]:
    needle = value.casefold()
    return [page.page_number for page in document.pages if needle in page.text.casefold()]


def _items(lines: list[str]) -> list[str]:
    return unique_items([clean_item(line) for line in lines])


def _entries(lines: list[str], document: ParsedDocument) -> list[ExperienceEntry]:
    return [ExperienceEntry(text=item, source_pages=_source_pages(document, item)) for item in _items(lines)]


def parse_resume(document: ParsedDocument) -> ResumeResult:
    lines = [clean_item(line) for line in document.text.splitlines() if clean_item(line)]
    sections = section_lines(document.text, RESUME_ALIASES)
    first_line = next((line for line in lines if not EMAIL.search(line) and not PHONE.search(line)), None)
    contact: dict[str, str] = {}
    email = EMAIL.search(document.text)
    phone = PHONE.search(document.text)
    url = URL.search(document.text)
    if email:
        contact["email"] = email.group(0)
    if phone:
        contact["phone"] = phone.group(0).strip()
    if url:
        contact["url"] = url.group(0).rstrip(".,)")
    warnings = list(document.warnings)
    if not first_line:
        warnings.append(ParseWarning("NAME_NOT_FOUND", "A resume name could not be identified."))
    if not contact:
        warnings.append(ParseWarning("CONTACT_NOT_FOUND", "No email, phone, or URL was identified."))
    role_keywords = unique_items(re.findall(
        r"\b(?:python|java|javascript|typescript|react|sql|aws|docker|kubernetes|fastapi|node\.js|machine learning|data analysis)\b",
        document.text,
        re.I,
    ))
    found = sum(bool(value) for value in [first_line, contact, sections.get("skills"), sections.get("experience")])
    confidence = round(min(1.0, (found / 4) * document.confidence), 3)
    return ResumeResult(
        name=first_line,
        contact_details=contact,
        summary="\n".join(sections.get("summary", [])) or None,
        skills=_items(sections.get("skills", [])),
        experience=_entries(sections.get("experience", []), document),
        projects=_entries(sections.get("projects", []), document),
        education=_entries(sections.get("education", []), document),
        certifications=_items(sections.get("certifications", [])),
        achievements=_items(sections.get("achievements", [])),
        languages=_items(sections.get("languages", [])),
        role_keywords=role_keywords,
        warnings=warnings,
        confidence=confidence,
        source_pages=sorted({page for value in lines for page in _source_pages(document, value)}),
    )


def _label_value(text: str, labels: set[str]) -> str | None:
    for line in text.splitlines():
        if ":" not in line:
            continue
        label, value = line.split(":", 1)
        if label.strip().casefold() in labels and value.strip():
            return clean_item(value)
    return None


def parse_job_description(document: ParsedDocument) -> JobDescriptionResult:
    sections = section_lines(document.text, JD_ALIASES)
    warnings = list(document.warnings)
    title = _label_value(document.text, {"job title", "title", "position", "role"})
    company = _label_value(document.text, {"company", "employer", "organization"})
    location = _label_value(document.text, {"location", "work location"})
    employment_type = _label_value(document.text, {"employment type", "type"})
    seniority_match = SENIORITY.search(document.text)
    if not title:
        for line in document.text.splitlines()[:10]:
            if line.strip() and len(line.strip()) < 100:
                title = clean_item(line)
                break
    if not title:
        warnings.append(ParseWarning("JOB_TITLE_NOT_FOUND", "A job title could not be identified."))
    if not sections.get("responsibilities"):
        warnings.append(ParseWarning("RESPONSIBILITIES_NOT_FOUND", "No responsibilities section was identified."))
    required = _items(sections.get("qualifications", []) + sections.get("skills", []))
    preferred = _items(sections.get("preferred", []))
    keywords = unique_items(re.findall(
        r"\b(?:python|java|javascript|typescript|react|sql|aws|docker|kubernetes|fastapi|node\.js|machine learning|data analysis|communication|leadership)\b",
        document.text,
        re.I,
    ))
    found = sum(bool(value) for value in [title, company, required, sections.get("responsibilities")])
    confidence = round(min(1.0, (found / 4) * document.confidence), 3)
    return JobDescriptionResult(
        job_title=title,
        company=company,
        seniority=seniority_match.group(0) if seniority_match else None,
        required_skills=required,
        preferred_skills=preferred,
        responsibilities=_items(sections.get("responsibilities", [])),
        qualifications=_items(sections.get("qualifications", [])),
        experience=_items(sections.get("experience", [])),
        education=_items(sections.get("education", [])),
        keywords=keywords,
        interview_competencies=_items(sections.get("competencies", [])),
        location=location,
        employment_type=employment_type,
        confidence=confidence,
        warnings=warnings,
        source_pages=sorted({page.page_number for page in document.pages if page.text}),
    )
