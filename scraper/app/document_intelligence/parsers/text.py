from __future__ import annotations

from charset_normalizer import from_bytes

from app.document_intelligence.parsers.errors import ParseError
from app.document_intelligence.parsers.models import PageResult
from app.document_intelligence.parsers.normalize import normalize_text


def decode_text(data: bytes) -> str:
    if not data:
        raise ParseError("EMPTY_DOCUMENT", "Document contains no bytes.", stage="decoding")
    result = from_bytes(data).best()
    if result is None:
        raise ParseError("UNSUPPORTED_ENCODING", "Document encoding could not be identified.", stage="decoding")
    return normalize_text(str(result))


def parse_plain_text(data: bytes) -> list[PageResult]:
    text = decode_text(data)
    return [PageResult(page_number=1, text=text, extraction_method="text")]
