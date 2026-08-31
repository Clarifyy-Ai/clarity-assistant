"""Generic past-paper scraper.

Given a list of seed listing pages and allowed PDF hosts, it discovers every
PDF link that mentions a year in the requested range, then reuses the same
PDF → MCQ extraction pipeline used by the UPSC scraper.

Concrete exam classes subclass this and set:
    exam_type, exam_name, seed_urls, allowed_hosts, subject (optional)

This is intentionally conservative: if a site doesn't expose plain PDFs, the
discover step yields nothing instead of throwing — admins simply see "0 papers"
and we can add a dedicated source later.
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
from app.scraper.answer_map import apply_answer_map, parse_answer_grid
from app.scraper.base import BaseScraper

log = get_logger(__name__)

YEAR_RE = re.compile(r"(20\d{2}|19\d{2})")
ANSWER_KEY_HINT = re.compile(r"answer\s*key|solution", re.I)

QUESTION_BLOCK_RE = re.compile(
    r"(?:^|\n)\s*(\d{1,3})\.\s+(.+?)(?=\n\s*\d{1,3}\.\s+|\Z)", re.DOTALL
)
OPTION_RE = re.compile(r"\(\s*([abcdABCD])\s*\)\s*([^\n(]+)")


class GenericPdfScraper(BaseScraper):
    """Base for sources whose past papers are linked as PDFs on listing pages."""

    exam_type: str = "GENERIC"
    exam_name: str = "Generic"
    seed_urls: list[str] = []
    allowed_hosts: set[str] = set()
    subject: str = "GENERAL"
    topic: str = "PYQ"

    async def discover(
        self, year_from: int | None, year_to: int | None
    ) -> AsyncIterator[PaperCandidate]:
        seen: set[str] = set()
        pdfs: list[tuple[str, str, int, bool]] = []

        for seed in self.seed_urls:
            try:
                html = await self.fetch(seed)
            except Exception as exc:
                log.warning(
                    "generic_listing_failed",
                    exam=self.exam_type, seed=seed, error=str(exc),
                )
                continue

            soup = BeautifulSoup(html, "lxml")
            for a in soup.select("a[href*='.pdf']"):
                href = a.get("href") or ""
                url = urljoin(seed, href)
                if "://" not in url:
                    continue
                host = url.split("/")[2].lower()
                if self.allowed_hosts and host not in self.allowed_hosts:
                    continue
                if url in seen:
                    continue
                seen.add(url)
                label = a.get_text(" ", strip=True) or url.rsplit("/", 1)[-1]
                ym = YEAR_RE.search(label + " " + url)
                if not ym:
                    continue
                year = int(ym.group(1))
                if year_from and year < year_from:
                    continue
                if year_to and year > year_to:
                    continue
                is_key = bool(ANSWER_KEY_HINT.search(label + " " + url))
                pdfs.append((url, label, year, is_key))

        keys_by_year = {y: u for (u, _, y, ak) in pdfs if ak}
        for url, label, year, is_key in pdfs:
            if is_key:
                continue
            yield PaperCandidate(
                exam_type=self.exam_type,
                exam_name=(label[:120] or f"{self.exam_name} {year}"),
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

        answers_partial = True
        if paper.answer_key_url and questions:
            try:
                key_bytes: bytes = await self.fetch(  # type: ignore[assignment]
                    paper.answer_key_url, expect_binary=True
                )
                key_text = self._extract_text(key_bytes)
                answer_map, conflicts = parse_answer_grid(key_text)
                if answer_map or conflicts:
                    _matched, answers_partial = apply_answer_map(
                        questions, answer_map, conflicts
                    )
            except Exception as exc:
                log.warning(
                    "generic_answer_key_failed",
                    exam=self.exam_type, error=str(exc),
                )

        return ParsedPaper(
            candidate=paper,
            pdf_bytes=pdf_bytes,
            questions=questions,
            images=images,
            file_hash=file_hash,
            answers_partial=answers_partial,
        )

    # ── helpers (mirrors UpscScraper) ────────────────────────────────────
    def _extract_text(self, pdf_bytes: bytes) -> str:
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            text = "\n".join((p.extract_text() or "") for p in reader.pages).strip()
            if len(text) > 200:
                return self._normalize(text)
        except Exception as exc:  # pragma: no cover
            log.warning("pypdf_failed", exam=self.exam_type, error=str(exc))

        try:
            from pdf2image import convert_from_bytes
            import pytesseract

            pages = convert_from_bytes(pdf_bytes, dpi=200)
            return self._normalize(
                "\n".join(pytesseract.image_to_string(p) for p in pages)
            )
        except Exception as exc:  # pragma: no cover
            log.warning("ocr_failed", exam=self.exam_type, error=str(exc))
            return ""

    @staticmethod
    def _normalize(text: str) -> str:
        text = re.sub(r"-\n\s*", "", text)
        text = re.sub(r"[ \t]+", " ", text)
        return text

    def _questions_from_text(self, text: str) -> list[ParsedQuestion]:
        out: list[ParsedQuestion] = []
        for _, body in QUESTION_BLOCK_RE.findall(text):
            stem, *_rest = re.split(r"\n?\s*\(\s*a\s*\)\s*", body, maxsplit=1, flags=re.I)
            stem = stem.strip()
            options_raw = OPTION_RE.findall(body)
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
                    correct_answer=None,
                    explanation="",
                    subject=self.subject,
                    topic=self.topic,
                    difficulty="MEDIUM",
                    latex_present=False,
                )
            )
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
            log.warning("image_extract_failed", exam=self.exam_type, error=str(exc))
        return images


# ─── Concrete sources ────────────────────────────────────────────────────
class SscCglScraper(GenericPdfScraper):
    exam_type = "SSC_CGL"
    exam_name = "SSC CGL"
    seed_urls = ["https://ssc.gov.in/previous-question-papers"]
    allowed_hosts = {"ssc.gov.in", "www.ssc.gov.in", "ssc.nic.in"}
    subject = "General"
    topic = "SSC CGL PYQ"


class IbpsPoScraper(GenericPdfScraper):
    exam_type = "IBPS_PO"
    exam_name = "IBPS PO"
    seed_urls = ["https://www.ibps.in/previous-year-question-papers/"]
    allowed_hosts = {"ibps.in", "www.ibps.in"}
    subject = "General"
    topic = "IBPS PO PYQ"


class GateScraper(GenericPdfScraper):
    exam_type = "GATE"
    exam_name = "GATE"
    seed_urls = [
        "https://gate.iitk.ac.in/previous-year-question-papers",
        "https://gate.iisc.ac.in/previous-years-question-papers/",
    ]
    allowed_hosts = {
        "gate.iitk.ac.in", "gate.iisc.ac.in", "gate.iitm.ac.in",
        "gate.iitb.ac.in", "gate.iitd.ac.in", "gate.iitkgp.ac.in",
        "gate.iitr.ac.in", "gate.iitg.ac.in",
    }
    subject = "Engineering"
    topic = "GATE PYQ"


class NeetScraper(GenericPdfScraper):
    exam_type = "NEET"
    exam_name = "NEET"
    seed_urls = ["https://neet.nta.nic.in/previous-year-question-paper/"]
    allowed_hosts = {"neet.nta.nic.in", "nta.ac.in", "www.nta.ac.in"}
    subject = "Science"
    topic = "NEET PYQ"


class JeeMainScraper(GenericPdfScraper):
    exam_type = "JEE_MAIN"
    exam_name = "JEE Main"
    seed_urls = ["https://jeemain.nta.nic.in/previous-year-question-paper/"]
    allowed_hosts = {"jeemain.nta.nic.in", "nta.ac.in", "www.nta.ac.in"}
    subject = "Science"
    topic = "JEE Main PYQ"


class JeeAdvancedScraper(GenericPdfScraper):
    exam_type = "JEE_ADVANCED"
    exam_name = "JEE Advanced"
    seed_urls = ["https://jeeadv.ac.in/past_qps.html"]
    allowed_hosts = {"jeeadv.ac.in", "www.jeeadv.ac.in"}
    subject = "Science"
    topic = "JEE Advanced PYQ"


class NdaScraper(GenericPdfScraper):
    exam_type = "NDA"
    exam_name = "NDA"
    seed_urls = ["https://upsc.gov.in/examinations/previous-question-papers"]
    allowed_hosts = {"upsc.gov.in", "www.upsc.gov.in", "documents.upsc.gov.in"}
    subject = "General"
    topic = "NDA PYQ"
