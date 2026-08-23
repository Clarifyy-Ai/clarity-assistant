"""Document extraction and classification engine."""

from __future__ import annotations

import base64
import binascii
import re
from typing import Any

from app.core.logger import get_logger
from app.document_intelligence.parsers.document import parse_bytes
from app.document_intelligence.parsers.errors import ParseError
from app.document_intelligence.parsers.structured import parse_job_description, parse_resume
from app.engines.document_classify import classify_document_text
from app.engines.schemas import EngineError

log = get_logger("engines.document_extract")

_ENGLISH_HINT = re.compile(
    r"\b(the|and|for|with|experience|skills|education|responsibilities|qualifications)\b",
    re.I,
)


def _detect_language(text: str) -> str:
    if not text.strip():
        return "unknown"
    if _ENGLISH_HINT.search(text):
        return "en"
    ascii_ratio = sum(1 for ch in text if ord(ch) < 128) / max(len(text), 1)
    return "en" if ascii_ratio > 0.85 else "unknown"


def _decode_content(payload: dict[str, Any]) -> tuple[bytes | None, str]:
    text = payload.get("text")
    if isinstance(text, str) and text.strip():
        return None, text
    raw_b64 = payload.get("content_base64") or payload.get("base64")
    if isinstance(raw_b64, str) and raw_b64.strip():
        try:
            return base64.b64decode(raw_b64, validate=True), ""
        except (binascii.Error, ValueError) as exc:
            raise EngineError("INVALID_BASE64", retryable=False) from exc
    raise EngineError("CONTENT_REQUIRED", retryable=False)


def _structured_for_type(
    document_type: str,
    parsed_doc: Any,
) -> dict[str, Any] | None:
    if document_type == "RESUME":
        resume = parse_resume(parsed_doc)
        return resume.model_dump()
    if document_type == "JOB_DESCRIPTION":
        jd = parse_job_description(parsed_doc)
        return jd.model_dump()
    return None


def run_document_extract(payload: dict[str, Any], *, operation_id: str, correlation_id: str) -> dict[str, Any]:
    log.info("[DOCUMENT] received", operation_id=operation_id, correlation_id=correlation_id)
    filename = str(payload.get("filename") or "document.txt")
    category_hint = (
        payload.get("category_hint")
        or payload.get("category")
        or payload.get("document_kind")
    )
    mime = str(payload.get("mime") or payload.get("mime_type") or "application/octet-stream")

    raw_bytes, inline_text = _decode_content(payload)
    log.info("[DOCUMENT] extracting", operation_id=operation_id, correlation_id=correlation_id, filename=filename)

    warnings: list[str] = []
    structured: dict[str, Any] | None = None
    page_count = 0
    extracted_text = inline_text
    confidence = 0.0
    extraction_status = "ok"
    parsed_doc: Any | None = None

    try:
        if raw_bytes is not None:
            parsed_doc = parse_bytes(raw_bytes, filename)
            extracted_text = parsed_doc.text
            page_count = len(parsed_doc.pages)
            confidence = parsed_doc.confidence
            warnings.extend(w.code for w in parsed_doc.warnings)
            if parsed_doc.review_required:
                warnings.append("review_required")
        elif extracted_text:
            page_count = max(1, extracted_text.count("\f") + 1)
            confidence = 0.9 if len(extracted_text) > 200 else 0.6
        else:
            raise EngineError("CONTENT_REQUIRED", retryable=False)
    except ParseError as exc:
        extraction_status = "failed"
        raise EngineError(exc.code, retryable=exc.retryable) from exc

    doc_type, type_confidence, classify_warnings = classify_document_text(
        extracted_text,
        category_hint=str(category_hint) if category_hint else None,
    )
    log.info(
        "[DOCUMENT] classified",
        operation_id=operation_id,
        correlation_id=correlation_id,
        detected_document_type=doc_type,
    )

    warnings.extend(classify_warnings)
    confidence = round(min(confidence, type_confidence), 3)

    if parsed_doc is not None:
        structured = _structured_for_type(doc_type, parsed_doc)

    result = {
        "extracted_text": extracted_text,
        "confidence": confidence,
        "warnings": warnings,
        "page_count": page_count,
        "detected_language": _detect_language(extracted_text),
        "detected_document_type": doc_type,
        "extraction_status": extraction_status,
        "structured": structured,
        "mime": mime,
        "filename": filename,
    }
    log.info("[DOCUMENT] completed", operation_id=operation_id, correlation_id=correlation_id)
    return result


def run_document_classify(payload: dict[str, Any], *, operation_id: str, correlation_id: str) -> dict[str, Any]:
    log.info("[DOCUMENT] received", operation_id=operation_id, correlation_id=correlation_id, stage="classify")
    text = payload.get("text") or payload.get("extracted_text")
    if not isinstance(text, str) or not text.strip():
        raise EngineError("TEXT_REQUIRED", retryable=False)

    category_hint = (
        payload.get("category_hint")
        or payload.get("category")
        or payload.get("document_kind")
    )
    doc_type, confidence, warnings = classify_document_text(
        text,
        category_hint=str(category_hint) if category_hint else None,
    )
    log.info(
        "[DOCUMENT] classified",
        operation_id=operation_id,
        correlation_id=correlation_id,
        detected_document_type=doc_type,
    )
    result = {
        "detected_document_type": doc_type,
        "confidence": confidence,
        "warnings": warnings,
        "detected_language": _detect_language(text),
    }
    log.info("[DOCUMENT] completed", operation_id=operation_id, correlation_id=correlation_id, stage="classify")
    return result
