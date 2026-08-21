from __future__ import annotations

from pathlib import PurePosixPath
from typing import Any

from app.document_intelligence.parsers.document import parse_bytes
from app.document_intelligence.parsers.errors import ParseError
from app.document_intelligence.parsers.models import JobDescriptionResult, ParsedDocument, ResumeResult
from app.document_intelligence.parsers.structured import parse_job_description, parse_resume


def parse_document_bytes(
    data: bytes,
    filename: str,
    category: str,
) -> tuple[ParsedDocument, ResumeResult | JobDescriptionResult | None]:
    """Parse supported bytes deterministically; missing fields remain null/empty."""
    suffix = PurePosixPath(filename.lower()).suffix
    if category == "resume_pdf" and suffix != ".pdf":
        raise ParseError("CATEGORY_EXTENSION_MISMATCH", "Resume documents must use the PDF extension.", stage="validation")
    if category == "job_description" and suffix not in {".pdf", ".docx", ".txt", ".html", ".htm"}:
        raise ParseError("CATEGORY_EXTENSION_MISMATCH", "Job descriptions must use an approved text document format.", stage="validation")
    document = parse_bytes(data, filename)
    if category == "resume_pdf":
        return document, parse_resume(document)
    if category == "job_description":
        return document, parse_job_description(document)
    return document, None
