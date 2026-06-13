"""UPSC CSE past-paper scraper.

Discovery: parse the official UPSC examinations page for PDF links to the
Prelims question papers, filter by year range.
Parsing: download PDF → extract text via pypdf → fall back to OCR via
pytesseract + pdf2image when the PDF has no embedded text.
"""
from __future__ import annotations

import hashlib
import io
import re
from collections.abc import AsyncIterator
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from pypdf import PdfReader

from app.core.logger import get_logger
from app.models.schemas import (
    PaperCandidate,
    ParsedImage,
    ParsedPaper,
    ParsedQuestion,
)
from app.scraper.base import BaseScraper

log = get_logger(__name__)

LISTING_URL = "https://upsc.gov.in/examinations/previous-question-papers"
ALLOWED_PDF_HOSTS = {"upsc.gov.in", "www.upsc.gov.in", "documents.upsc.gov.in"}

YEAR_RE = re.compile(r"(20\d{2}|19\d{2})")
QUESTION_BLOCK_RE = re.compile(
    r"(?:^|\n)\s*(\d{1,3})\.\s+(.+?)(?=\n\s*\d{1,3}\.\s+|\Z)", re.DOTALL
)
OPTION_RE = re.compile(r"\(?([abcdABCD])\)?[.)]\s*([^\n(]+)")


class UpscScraper(BaseScraper):
    exam_type = "UPSC"

    async def discover(
        self, year_from: int | None, year_to: int | None
    ) -> AsyncIterator[PaperCandidate]:
        try:
            html = await self.fetch(LISTING_URL)
        except Exception as exc:
            log.error("upsc_listing_failed", error=str(exc))
            return

        soup = BeautifulSoup(html, "lxml")
        seen: set[str] = set()
        for a in soup.select("a[href$='.pdf'], a[href*='.pdf']"):
            href = a.get("href") or ""
            url = urljoin(LISTING_URL, href)
            host = url.split("/")[2].lower() if "://" in url else ""
            if host not in ALLOWED_PDF_HOSTS:
                continue
            if url in seen:
                continue
            seen.add(url)

            text = a.get_text(" ", strip=True)
            year_match = YEAR_RE.search(text + " " + url)
            if not year_match:
                continue
            year = int(year_match.group(1))
            if year_from and year < year_from:
                continue
            if year_to and year > year_to:
                continue

            yield PaperCandidate(
                exam_type="UPSC CSE",
                exam_name=text[:120] or f"UPSC CSE {year}",
                year=year,
                source_url=url,
                paper_code=hashlib.md5(url.encode()).hexdigest()[:10],
            )

    async def parse(self, paper: PaperCandidate) -> ParsedPaper:
        pdf_bytes: bytes = await self.fetch(str(paper.source_url), expect_binary=True)  # type: ignore[assignment]
        file_hash = hashlib.sha256(pdf_bytes).hexdigest()

        text = self._extract_text(pdf_bytes)
        questions = self._questions_from_text(text)
        images = self._extract_images(pdf_bytes)

        return ParsedPaper(
            candidate=paper,
            pdf_bytes=pdf_bytes,
            questions=questions,
            images=images,
            file_hash=file_hash,
        )

    # ── Helpers ──────────────────────────────────────────────────────────

    def _extract_text(self, pdf_bytes: bytes) -> str:
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            chunks = [(page.extract_text() or "") for page in reader.pages]
            text = "\n".join(chunks).strip()
            if len(text) > 200:
                return text
        except Exception as exc:  # pragma: no cover
            log.warning("pypdf_failed", error=str(exc))

        # OCR fallback
        try:
            from pdf2image import convert_from_bytes
            import pytesseract

            pages = convert_from_bytes(pdf_bytes, dpi=200)
            return "\n".join(pytesseract.image_to_string(p) for p in pages)
        except Exception as exc:  # pragma: no cover
            log.warning("ocr_failed", error=str(exc))
            return ""

    def _questions_from_text(self, text: str) -> list[ParsedQuestion]:
        out: list[ParsedQuestion] = []
        for _, body in QUESTION_BLOCK_RE.findall(text):
            stem, *_ = re.split(r"\n\s*\(?[aA]\)?[.)]\s*", body, maxsplit=1)
            stem = stem.strip()
            options_raw = OPTION_RE.findall(body)
            if len(options_raw) < 4 or len(stem) < 10:
                continue
            options = [
                {"label": lbl.upper(), "text": txt.strip()[:500]}
                for lbl, txt in options_raw[:4]
            ]
            out.append(
                ParsedQuestion(
                    question_text=stem[:2000],
                    options=options,
                    correct_answer="A",  # answer key parsed separately
                    explanation="",
                    subject="GS",
                    topic="UPSC PYQ",
                    difficulty="MEDIUM",
                    latex_present=False,
                )
            )
        return out

    def _extract_images(self, pdf_bytes: bytes) -> list[ParsedImage]:
        """Best-effort image extraction. Returns embedded raster images only."""
        images: list[ParsedImage] = []
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            for page in reader.pages:
                for img in getattr(page, "images", []) or []:
                    if not img.data or len(img.data) < 1024:
                        continue
                    ext_name = (img.name or "img.png").rsplit(".", 1)[-1].lower()
                    ext = ext_name if ext_name in {"png", "jpg", "jpeg", "webp"} else "png"
                    images.append(ParsedImage(data=img.data, ext=ext))  # type: ignore[arg-type]
        except Exception as exc:  # pragma: no cover
            log.warning("image_extract_failed", error=str(exc))
        return images
