"""UPSC CSE past-paper scraper with answer-key extraction.

Discovery: parse the official UPSC listing for PDF links, pairing each question
paper with its matching official Answer Key PDF (released separately).
Parsing: pypdf text extraction → OCR fallback. Answers are extracted from the
linked answer-key PDF by parsing the `1. (b)  2. (c) …` grid.
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
ANSWER_KEY_HINT = re.compile(r"answer\s*key", re.I)

# Match `1.  ` … up to the next numbered marker
QUESTION_BLOCK_RE = re.compile(
    r"(?:^|\n)\s*(\d{1,3})\.\s+(.+?)(?=\n\s*\d{1,3}\.\s+|\Z)", re.DOTALL
)
OPTION_RE = re.compile(r"\(\s*([abcdABCD])\s*\)\s*([^\n(]+)")
# Answer key grid: `1.(b)`  `2 (c)` etc.
ANSWER_GRID_RE = re.compile(
    r"(\d{1,3})\s*[.\)]?\s*\(?\s*([abcdABCD])\s*\)?", re.MULTILINE
)


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
        pdfs: list[tuple[str, str, int, bool]] = []  # (url, label, year, is_answer_key)
        seen: set[str] = set()
        for a in soup.select("a[href$='.pdf'], a[href*='.pdf']"):
            href = a.get("href") or ""
            url = urljoin(LISTING_URL, href)
            host = url.split("/")[2].lower() if "://" in url else ""
            if host not in ALLOWED_PDF_HOSTS or url in seen:
                continue
            seen.add(url)
            text = a.get_text(" ", strip=True)
            ym = YEAR_RE.search(text + " " + url)
            if not ym:
                continue
            year = int(ym.group(1))
            if year_from and year < year_from:
                continue
            if year_to and year > year_to:
                continue
            pdfs.append((url, text, year, bool(ANSWER_KEY_HINT.search(text + " " + url))))

        # Pair question papers with the nearest answer key from the same year
        keys_by_year = {y: u for u, _, y, ak in pdfs if ak for u_ in [u]}
        keys_by_year = {y: u for (u, _, y, ak) in pdfs if ak}
        for url, label, year, is_key in pdfs:
            if is_key:
                continue
            yield PaperCandidate(
                exam_type="UPSC CSE",
                exam_name=label[:120] or f"UPSC CSE {year}",
                year=year,
                source_url=url,
                paper_code=hashlib.md5(url.encode()).hexdigest()[:10],
                answer_key_url=keys_by_year.get(year),
            )

    async def parse(self, paper: PaperCandidate) -> ParsedPaper:
        pdf_bytes: bytes = await self.fetch(str(paper.source_url), expect_binary=True)  # type: ignore[assignment]
        file_hash = hashlib.sha256(pdf_bytes).hexdigest()

        text = self._extract_text(pdf_bytes)
        questions = self._questions_from_text(text)
        images = self._extract_images(pdf_bytes)

        # Answer-key extraction
        answers_partial = True
        if paper.answer_key_url and questions:
            try:
                key_bytes: bytes = await self.fetch(  # type: ignore[assignment]
                    paper.answer_key_url, expect_binary=True
                )
                key_text = self._extract_text(key_bytes)
                answer_map = self._answers_from_key(key_text)
                if answer_map:
                    matched = 0
                    for idx, q in enumerate(questions, start=1):
                        a = answer_map.get(idx)
                        if a:
                            q.correct_answer = a
                            matched += 1
                    answers_partial = matched < len(questions)
                    log.info(
                        "upsc_answers_mapped",
                        matched=matched, total=len(questions),
                    )
            except Exception as exc:
                log.warning("upsc_answer_key_failed", error=str(exc))

        return ParsedPaper(
            candidate=paper,
            pdf_bytes=pdf_bytes,
            questions=questions,
            images=images,
            file_hash=file_hash,
            answers_partial=answers_partial,
        )

    # ── Helpers ──────────────────────────────────────────────────────────

    def _extract_text(self, pdf_bytes: bytes) -> str:
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            text = "\n".join((p.extract_text() or "") for p in reader.pages).strip()
            if len(text) > 200:
                return self._normalize(text)
        except Exception as exc:  # pragma: no cover
            log.warning("pypdf_failed", error=str(exc))

        try:
            from pdf2image import convert_from_bytes
            import pytesseract

            pages = convert_from_bytes(pdf_bytes, dpi=200)
            return self._normalize(
                "\n".join(pytesseract.image_to_string(p) for p in pages)
            )
        except Exception as exc:  # pragma: no cover
            log.warning("ocr_failed", error=str(exc))
            return ""

    @staticmethod
    def _normalize(text: str) -> str:
        # Collapse runs of whitespace, drop hyphenation at line breaks
        text = re.sub(r"-\n\s*", "", text)
        text = re.sub(r"[ \t]+", " ", text)
        return text

    def _questions_from_text(self, text: str) -> list[ParsedQuestion]:
        out: list[ParsedQuestion] = []
        for _, body in QUESTION_BLOCK_RE.findall(text):
            stem, *_rest = re.split(r"\n?\s*\(\s*a\s*\)\s*", body, maxsplit=1, flags=re.I)
            stem = stem.strip()
            options_raw = OPTION_RE.findall(body)
            # Require 4 distinct option labels A-D
            seen_labels = {lbl.upper() for lbl, _ in options_raw}
            if len(seen_labels) < 4 or len(stem) < 20:
                continue
            opts_by_label: dict[str, str] = {}
            for lbl, txt in options_raw:
                key = lbl.upper()
                if key not in opts_by_label:
                    opts_by_label[key] = txt.strip()[:500]
            if not all(k in opts_by_label for k in "ABCD"):
                continue
            options = [{"label": k, "text": opts_by_label[k]} for k in "ABCD"]
            out.append(
                ParsedQuestion(
                    question_text=stem[:2000],
                    options=options,
                    correct_answer=None,  # filled in by answer-key extraction
                    explanation="",
                    subject="GS",
                    topic="UPSC PYQ",
                    difficulty="MEDIUM",
                    latex_present=False,
                )
            )
        return out

    @staticmethod
    def _answers_from_key(text: str) -> dict[int, str]:
        out: dict[int, str] = {}
        for num, letter in ANSWER_GRID_RE.findall(text):
            try:
                n = int(num)
            except ValueError:
                continue
            if 1 <= n <= 300 and n not in out:
                out[n] = letter.upper()
        return out

    def _extract_images(self, pdf_bytes: bytes) -> list[ParsedImage]:
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
