from __future__ import annotations

import io
import statistics
from typing import Any

from pypdf import PdfReader

from app.document_intelligence.parsers.errors import ParseError
from app.document_intelligence.parsers.models import PageResult, ParseWarning
from app.document_intelligence.parsers.normalize import normalize_text


def _ocr_page(data: bytes, page_number: int) -> tuple[str, float | None, list[dict[str, Any]]]:
    try:
        from pdf2image import convert_from_bytes
        import pytesseract
        from pytesseract import Output
    except ImportError as exc:
        raise ParseError("OCR_UNAVAILABLE", "OCR dependencies are not installed.", stage="ocr") from exc
    try:
        image = convert_from_bytes(data, first_page=page_number, last_page=page_number, dpi=200)[0]
        result = pytesseract.image_to_data(image, output_type=Output.DICT)
    except Exception as exc:
        raise ParseError("OCR_FAILED", "OCR could not process the scanned page.", retryable=True, stage="ocr") from exc
    words: list[str] = []
    confidences: list[float] = []
    low_regions: list[dict[str, Any]] = []
    for i, raw in enumerate(result.get("text", [])):
        word = str(raw).strip()
        if not word:
            continue
        words.append(word)
        try:
            confidence = float(result["conf"][i])
        except (KeyError, TypeError, ValueError):
            continue
        if confidence >= 0:
            confidences.append(confidence)
            if confidence < 50:
                low_regions.append({
                    "text": word,
                    "confidence": round(confidence, 2),
                    "left": result.get("left", [0])[i],
                    "top": result.get("top", [0])[i],
                    "width": result.get("width", [0])[i],
                    "height": result.get("height", [0])[i],
                })
    return normalize_text(" ".join(words)), (
        round(statistics.fmean(confidences), 2) if confidences else None
    ), low_regions


def parse_pdf(data: bytes) -> tuple[list[PageResult], list[ParseWarning]]:
    if not data:
        raise ParseError("EMPTY_DOCUMENT", "PDF contains no bytes.", stage="decoding")
    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted:
            raise ParseError("PDF_ENCRYPTED", "Encrypted PDFs are not supported.", stage="validation")
    except ParseError:
        raise
    except Exception as exc:
        raise ParseError("PDF_CORRUPT", "PDF could not be opened.", stage="decoding") from exc

    pages: list[PageResult] = []
    warnings: list[ParseWarning] = []
    for index, page in enumerate(reader.pages, start=1):
        try:
            text = normalize_text(page.extract_text() or "")
        except Exception:
            text = ""
        if len(text) >= 20:
            image_refs = [f"page-{index}-image-{n}" for n, _ in enumerate(getattr(page, "images", []), start=1)]
            table_refs = [f"page-{index}-table-{n}" for n, line in enumerate(text.splitlines(), start=1)
                          if "|" in line or "  " in line][:20]
            pages.append(PageResult(
                page_number=index, text=text, extraction_method="text",
                image_references=image_refs, table_references=table_refs,
            ))
            continue
        ocr_text, ocr_confidence, low_regions = _ocr_page(data, index)
        page_result = PageResult(
            page_number=index,
            text=ocr_text,
            extraction_method="ocr" if ocr_text else "none",
            ocr_confidence=ocr_confidence,
            low_confidence_regions=low_regions,
        )
        pages.append(page_result)
        if not ocr_text:
            warnings.append(ParseWarning("NO_TEXT_EXTRACTED", "Page contains no extractable text.", [index]))
        if ocr_confidence is not None and ocr_confidence < 60:
            warnings.append(ParseWarning("LOW_OCR_CONFIDENCE", "OCR confidence is low; review this page.", [index]))
    return pages, warnings
