"""Run supported exam scrapes once per day while this service is up."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from supabase import create_client

from app.core.config import Settings
from app.core.logger import get_logger
from app.scraper.sources import supported_exam_types
from app.workers.scrape_worker import registry

log = get_logger(__name__)


def seconds_until_utc_hour(hour: int, now: datetime | None = None) -> float:
    """Seconds from `now` until the next occurrence of `hour:00` UTC."""
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    current = current.astimezone(timezone.utc)
    target = current.replace(hour=hour, minute=0, second=0, microsecond=0)
    if current >= target:
        target += timedelta(days=1)
    return max(1.0, (target - current).total_seconds())


def _already_ran_today(db, exam_type: str) -> bool:
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    res = (
        db.table("scrape_jobs")
        .select("id")
        .eq("exam_type", exam_type)
        .gte("created_at", start.isoformat())
        .in_("status", ["queued", "running", "completed"])
        .limit(1)
        .execute()
    )
    return bool(res.data)


async def run_daily_scrapes(settings: Settings) -> None:
    """Scrape last calendar year for every registered exam type, sequentially."""
    year = datetime.now(timezone.utc).year - 1
    db = create_client(settings.supabase_url, settings.supabase_service_role_key)
    exams = supported_exam_types()
    log.info("daily_scrape_begin", exams=exams, year=year)
    for exam_type in exams:
        try:
            if _already_ran_today(db, exam_type):
                log.info("daily_scrape_skip", exam_type=exam_type, reason="already_ran_today")
                continue
            state = await registry.create(
                exam_type=exam_type,
                year_from=year,
                year_to=year,
                settings=settings,
                supabase=db,
                created_by=None,
            )
            handle = registry.get(state.job_id)
            if handle and handle.task:
                await handle.task
            log.info("daily_scrape_exam_done", exam_type=exam_type, job_id=state.job_id)
        except Exception as exc:  # noqa: BLE001 — keep remaining exams going
            log.error("daily_scrape_exam_failed", exam_type=exam_type, error=str(exc)[:300])
    log.info("daily_scrape_complete")


async def daily_scrape_loop(settings: Settings, stop: asyncio.Event) -> None:
    hour = settings.scrape_daily_hour_utc
    log.info("daily_scrape_scheduler_started", hour_utc=hour)
    while not stop.is_set():
        delay = seconds_until_utc_hour(hour)
        log.info("daily_scrape_sleep", seconds=int(delay))
        try:
            await asyncio.wait_for(stop.wait(), timeout=delay)
            break
        except asyncio.TimeoutError:
            await run_daily_scrapes(settings)
    log.info("daily_scrape_scheduler_stopped")
