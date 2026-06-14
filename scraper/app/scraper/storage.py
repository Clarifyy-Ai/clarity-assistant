"""Supabase Storage + Database writes for parsed papers."""
from __future__ import annotations

from typing import Any

from supabase import Client

from app.core.config import Settings
from app.core.logger import get_logger
from app.models.schemas import ParsedImage, ParsedPaper

log = get_logger(__name__)


class StorageGateway:
    """Encapsulates all writes to Supabase (DB + Storage buckets)."""

    def __init__(self, client: Client, settings: Settings) -> None:
        self.db = client
        self.settings = settings

    # ── Idempotency (dedicated table) ───────────────────────────────────

    def already_ingested(self, source_url: str, file_hash: str) -> bool:
        res = (
            self.db.table("scrape_ingested")
            .select("id")
            .eq("source_url", source_url)
            .eq("file_hash", file_hash)
            .limit(1)
            .execute()
        )
        return bool(res.data)

    def mark_ingested(
        self,
        job_id: str | None,
        source_url: str,
        file_hash: str,
        paper_id: str | None,
    ) -> None:
        try:
            self.db.table("scrape_ingested").insert(
                {
                    "job_id": job_id,
                    "source_url": source_url,
                    "file_hash": file_hash,
                    "paper_id": paper_id,
                }
            ).execute()
        except Exception as exc:  # pragma: no cover - unique violation is fine
            log.info("ingested_marker_skipped", url=source_url, reason=str(exc)[:120])

    # ── Binary uploads ──────────────────────────────────────────────────

    def upload_pdf(self, path: str, data: bytes) -> str:
        bucket = self.settings.storage_bucket_papers
        self.db.storage.from_(bucket).upload(
            path, data, {"content-type": "application/pdf", "upsert": "true"}
        )
        return self.db.storage.from_(bucket).get_public_url(path)

    def upload_image(self, path: str, image: ParsedImage) -> str:
        bucket = self.settings.storage_bucket_images
        mime = f"image/{image.ext}"
        self.db.storage.from_(bucket).upload(
            path, image.data, {"content-type": mime, "upsert": "true"}
        )
        return self.db.storage.from_(bucket).get_public_url(path)

    # ── DB rows ─────────────────────────────────────────────────────────

    def upsert_paper(self, paper: ParsedPaper, pdf_public_url: str | None) -> str | None:
        """Find-or-update the exam_papers row. Returns the row id."""
        c = paper.candidate
        q = (
            self.db.table("exam_papers")
            .select("id, total_questions")
            .eq("exam_type", c.exam_type)
            .eq("exam_name", c.exam_name)
            .eq("year", c.year)
        )
        if c.shift:
            q = q.eq("shift", c.shift)
        existing = q.limit(1).execute()

        if existing.data:
            row_id = existing.data[0]["id"]
            # Update total_questions if scraper found more this run
            new_total = len(paper.questions)
            old_total = existing.data[0].get("total_questions") or 0
            if new_total and new_total != old_total:
                self.db.table("exam_papers").update(
                    {"total_questions": new_total}
                ).eq("id", row_id).execute()
            return row_id

        row = {
            "exam_type": c.exam_type,
            "exam_name": c.exam_name,
            "year": c.year,
            "session": c.session,
            "shift": c.shift,
            "total_questions": len(paper.questions),
            "duration_minutes": None,
            "difficulty_level": "MEDIUM",
        }
        ins = self.db.table("exam_papers").insert(row).execute()
        return ins.data[0]["id"] if ins.data else None

    def insert_questions(
        self, paper: ParsedPaper, paper_id: str | None
    ) -> list[str]:
        c = paper.candidate
        rows: list[dict[str, Any]] = []
        for q in paper.questions:
            # Skip questions with unknown answers when the whole paper is marked partial.
            if q.correct_answer is None:
                continue
            rows.append(
                {
                    "question_text": q.question_text[:4000],
                    "question_type": "MCQ",
                    "options": q.options,
                    "correct_answer": q.correct_answer,
                    "explanation": q.explanation[:4000],
                    "subject": q.subject[:120],
                    "topic": q.topic[:120],
                    "difficulty": q.difficulty,
                    "exam_type": c.exam_type,
                    "source": "Previous Year Paper",
                    "source_year": c.year,
                    "is_verified": not paper.answers_partial,
                    "is_public": True,
                    "marks_positive": 4,
                    "marks_negative": 1,
                    "image_url": q.image_url,
                    "latex_present": q.latex_present,
                }
            )
        if not rows:
            return []
        res = self.db.table("questions").insert(rows).execute()
        ids = [r["id"] for r in (res.data or [])]
        log.info("questions_inserted", paper_id=paper_id, count=len(ids))
        return ids

    def insert_images(
        self,
        paper_id: str | None,
        question_ids: list[str],
        images: list[ParsedImage],
        public_urls: list[str],
        storage_paths: list[str],
    ) -> int:
        if not images:
            return 0
        rows = []
        for img, url, path in zip(images, public_urls, storage_paths, strict=False):
            qid = (
                question_ids[img.question_index]
                if img.question_index is not None
                and img.question_index < len(question_ids)
                else None
            )
            rows.append(
                {
                    "paper_id": paper_id,
                    "question_id": qid,
                    "storage_path": path,
                    "public_url": url,
                    "alt_text": img.alt_text,
                }
            )
        try:
            self.db.table("exam_images").upsert(
                rows, on_conflict="storage_path"
            ).execute()
            return len(rows)
        except Exception as exc:
            log.error("exam_images_insert_failed", error=str(exc))
            return 0

    # ── Failures + job persistence ──────────────────────────────────────

    def record_failure(
        self,
        job_id: str | None,
        url: str,
        status_code: int | None,
        error: str,
    ) -> None:
        try:
            self.db.table("scrape_failures").insert(
                {
                    "job_id": job_id,
                    "source_url": url,
                    "status_code": status_code,
                    "error": error[:1000],
                }
            ).execute()
        except Exception as exc:  # pragma: no cover
            log.warning("record_failure_failed", error=str(exc))

    def upsert_job(
        self,
        job_id: str,
        *,
        exam_type: str,
        year_from: int | None,
        year_to: int | None,
        status: str,
        progress: dict,
        logs: list[str],
        error: str | None = None,
        created_by: str | None = None,
    ) -> None:
        try:
            self.db.table("scrape_jobs").upsert(
                {
                    "id": job_id,
                    "exam_type": exam_type,
                    "year_from": year_from,
                    "year_to": year_to,
                    "status": status,
                    "progress": progress,
                    "logs": logs[-50:],
                    "error": error,
                    "created_by": created_by,
                }
            ).execute()
        except Exception as exc:  # pragma: no cover
            log.warning("upsert_job_failed", job_id=job_id, error=str(exc))
