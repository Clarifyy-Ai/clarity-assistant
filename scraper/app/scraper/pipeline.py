"""Orchestrator: discover → download → parse → store."""
from __future__ import annotations

import asyncio
import hashlib
from typing import Callable

from prometheus_client import Counter
from supabase import Client

from app.core.config import Settings
from app.core.logger import get_logger
from app.core.rate_limit import AsyncRateLimiter
from app.models.schemas import JobProgress
from app.scraper.base import BaseScraper, sanitize_filename
from app.scraper.sources import get_scraper_for
from app.scraper.storage import StorageGateway

PAPERS = Counter("scrape_papers_total", "Papers successfully ingested")
QUESTIONS = Counter("scrape_questions_total", "Questions inserted")
IMAGES = Counter("scrape_images_total", "Images uploaded")
ERRORS = Counter("scrape_errors_total", "Errors encountered")
RETRIES = Counter("scrape_retries_total", "HTTP retries performed")

log = get_logger(__name__)


class ScrapePipeline:
    """Coordinates a single scrape job for one exam_type."""

    def __init__(
        self,
        *,
        settings: Settings,
        supabase: Client,
        exam_type: str,
        year_from: int | None,
        year_to: int | None,
        job_id: str,
        progress_cb: Callable[[JobProgress], None],
        pause_event: asyncio.Event,
        cancel_event: asyncio.Event,
    ) -> None:
        self.settings = settings
        self.exam_type = exam_type
        self.year_from = year_from
        self.year_to = year_to
        self.job_id = job_id
        self.progress = JobProgress()
        self.progress_cb = progress_cb
        self.pause_event = pause_event
        self.cancel_event = cancel_event
        self.limiter = AsyncRateLimiter(
            settings.scrape_delay_seconds, settings.scrape_per_domain_concurrency
        )
        self.storage = StorageGateway(supabase, settings)
        self.global_sem = asyncio.Semaphore(settings.scrape_max_concurrency)

    async def run(self) -> None:
        scraper_cls = get_scraper_for(self.exam_type)
        if scraper_cls is None:
            raise RuntimeError(f"No parser registered for exam_type={self.exam_type}")

        scraper: BaseScraper = scraper_cls(self.settings, self.limiter)
        try:
            async for candidate in scraper.discover(self.year_from, self.year_to):
                if self.cancel_event.is_set():
                    log.info("job_cancelled", job_id=self.job_id)
                    return
                # Pause loop
                while self.pause_event.is_set():
                    await asyncio.sleep(0.5)
                    if self.cancel_event.is_set():
                        return

                self.progress.total_papers += 1
                self.progress_cb(self.progress)
                async with self.global_sem:
                    await self._process_one(scraper, candidate)
        finally:
            await scraper.aclose()

    async def _process_one(self, scraper: BaseScraper, candidate) -> None:
        url = str(candidate.source_url)
        try:
            parsed = await scraper.parse(candidate)
        except Exception as exc:
            ERRORS.inc()
            log.error("parse_failed", url=url, error=str(exc))
            self.storage.record_failure(self.job_id, url, None, f"parse:{exc}")
            return

        if self.storage.already_ingested(url, parsed.file_hash):
            log.info("skip_already_ingested", url=url)
            return

        # Upload raw PDF (best effort)
        pdf_public_url = None
        if parsed.pdf_bytes:
            path = (
                f"{sanitize_filename(candidate.exam_type)}/{candidate.year}/"
                f"{sanitize_filename(candidate.paper_code or parsed.file_hash[:12])}.pdf"
            )
            try:
                pdf_public_url = self.storage.upload_pdf(path, parsed.pdf_bytes)
            except Exception as exc:
                ERRORS.inc()
                log.warning("pdf_upload_failed", url=url, error=str(exc))

        # Insert paper + questions
        try:
            paper_id = self.storage.upsert_paper(parsed, pdf_public_url)
            question_ids = self.storage.insert_questions(parsed, paper_id)
        except Exception as exc:
            ERRORS.inc()
            log.error("db_insert_failed", url=url, error=str(exc))
            self.storage.record_failure(self.job_id, url, None, f"db:{exc}")
            return

        # Upload images
        image_urls: list[str] = []
        for idx, img in enumerate(parsed.images):
            path = (
                f"{sanitize_filename(candidate.exam_type)}/{candidate.year}/"
                f"{sanitize_filename(candidate.paper_code or parsed.file_hash[:12])}_img{idx}.{img.ext}"
            )
            try:
                image_urls.append(self.storage.upload_image(path, img))
            except Exception as exc:
                ERRORS.inc()
                log.warning("image_upload_failed", url=url, error=str(exc))

        saved_imgs = self.storage.insert_images(
            paper_id, question_ids, parsed.images, image_urls
        )

        self.storage.mark_ingested(self.job_id, url, parsed.file_hash)

        PAPERS.inc()
        QUESTIONS.inc(len(question_ids))
        IMAGES.inc(saved_imgs)
        self.progress.processed_papers += 1
        self.progress.extracted_questions += len(question_ids)
        self.progress.saved_images += saved_imgs
        self.progress_cb(self.progress)


def hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
