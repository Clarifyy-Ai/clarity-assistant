from __future__ import annotations

from pathlib import PurePosixPath
from statistics import fmean

from app.document_intelligence.parsers.errors import ParseError
from app.document_intelligence.parsers.image import parse_image
from app.document_intelligence.parsers.models import ParsedDocument, ParseWarning
from app.document_intelligence.parsers.office import parse_office
from app.document_intelligence.parsers.pdf import parse_pdf
from app.document_intelligence.parsers.text import parse_plain_text
from app.document_intelligence.parsers.web import parse_html
from app.document_intelligence.parsers.normalize import normalize_text

PARSER_VERSION = "2026.08.21.1"


def _media_type(filename: str) -> str:
    suffix = PurePosixPath(filename.lower()).suffix
    return {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".txt": "text/plain",
        ".csv": "text/csv",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".html": "text/html",
        ".htm": "text/html",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }.get(suffix, "application/octet-stream")


def parse_bytes(data: bytes, filename: str) -> ParsedDocument:
    suffix = PurePosixPath(filename.lower()).suffix
    if suffix == ".pdf":
        pages, warnings = parse_pdf(data)
    elif suffix in {".docx", ".csv", ".xlsx"}:
        pages, warnings = parse_office(data, filename), []
    elif suffix in {".html", ".htm"}:
        pages, warnings = parse_html(data), []
    elif suffix == ".txt":
        pages, warnings = parse_plain_text(data), []
    elif suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        pages, warnings = parse_image(data)
    else:
        raise ParseError("UNSUPPORTED_FORMAT", "File format is not supported by the deterministic parser.", stage="validation")

    text = normalize_text("\n\n".join(page.text for page in pages if page.text))
    confidences = [
        page.ocr_confidence for page in pages
        if page.extraction_method == "ocr" and page.ocr_confidence is not None
    ]
    confidence = round(fmean(confidences) / 100, 3) if confidences else (1.0 if text else 0.0)
    review_required = bool(warnings) or confidence < 0.6 or not text
    if not text and not any(w.code == "NO_TEXT_EXTRACTED" for w in warnings):
        warnings.append(ParseWarning("NO_TEXT_EXTRACTED", "No text was extracted from the document."))
    return ParsedDocument(
        parser_version=PARSER_VERSION,
        filename=filename,
        media_type=_media_type(filename),
        pages=pages,
        text=text,
        warnings=warnings,
        confidence=confidence,
        review_required=review_required,
    )
