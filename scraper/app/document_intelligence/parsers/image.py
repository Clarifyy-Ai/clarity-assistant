from __future__ import annotations

import io
from statistics import fmean

from PIL import Image

from app.document_intelligence.parsers.errors import ParseError
from app.document_intelligence.parsers.models import PageResult, ParseWarning
from app.document_intelligence.parsers.normalize import normalize_text


def parse_image(data: bytes) -> tuple[list[PageResult], list[ParseWarning]]:
    try:
        Image.open(io.BytesIO(data)).verify()
    except Exception as exc:
        raise ParseError("IMAGE_CORRUPT", "Image could not be opened.", stage="decoding") from exc
    try:
        import pytesseract
        from pytesseract import Output
        image = Image.open(io.BytesIO(data))
        result = pytesseract.image_to_data(image, output_type=Output.DICT)
        words = [str(word).strip() for word in result.get("text", []) if str(word).strip()]
        confidences = []
        for value in result.get("conf", []):
            try:
                if float(value) >= 0:
                    confidences.append(float(value))
            except (TypeError, ValueError):
                pass
    except Exception as exc:
        raise ParseError("OCR_FAILED", "OCR could not process the image.", retryable=True, stage="ocr") from exc
    confidence = round(fmean(confidences), 2) if confidences else None
    warnings = []
    if confidence is None or confidence < 60:
        warnings.append(ParseWarning("LOW_OCR_CONFIDENCE", "OCR confidence is low; review the image."))
    return [PageResult(
        page_number=1,
        text=normalize_text(" ".join(words)),
        extraction_method="ocr" if words else "none",
        ocr_confidence=confidence,
    )], warnings
