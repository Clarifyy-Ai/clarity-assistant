from __future__ import annotations

from bs4 import BeautifulSoup

from app.document_intelligence.parsers.models import PageResult
from app.document_intelligence.parsers.normalize import normalize_text


def parse_html(data: bytes) -> list[PageResult]:
    soup = BeautifulSoup(data, "lxml")
    for element in soup(["script", "style", "noscript", "template", "svg"]):
        element.decompose()
    return [PageResult(
        page_number=1,
        text=normalize_text(soup.get_text("\n")),
        extraction_method="text",
    )]
