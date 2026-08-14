"""FastAPI entrypoint for the Clarity.AI gov-exam scraper."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.logger import configure_logging, get_logger
from app.routes import health, metrics, scrape
from app.workers.daily_scheduler import daily_scrape_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    log = get_logger("startup")
    # Fail-fast validation of critical env
    missing = [
        k for k, v in {
            "SUPABASE_URL": settings.supabase_url,
            "SUPABASE_SERVICE_ROLE_KEY": settings.supabase_service_role_key,
            "SUPABASE_JWKS_URL": settings.supabase_jwks_url,
        }.items() if not v
    ]
    if missing:
        raise RuntimeError(f"Missing required env: {missing}")
    stop = asyncio.Event()
    scheduler_task: asyncio.Task[None] | None = None
    if settings.scrape_daily_enabled:
        scheduler_task = asyncio.create_task(
            daily_scrape_loop(settings, stop),
            name="daily-exam-scrape",
        )
    log.info(
        "scraper_started",
        port=settings.port,
        cors_origins=settings.cors_origins,
        daily_scrape=settings.scrape_daily_enabled,
        daily_hour_utc=settings.scrape_daily_hour_utc,
    )
    yield
    stop.set()
    if scheduler_task:
        scheduler_task.cancel()
        try:
            await scheduler_task
        except asyncio.CancelledError:
            pass
    log.info("scraper_stopped")


app = FastAPI(
    title="Clarity.AI Gov-Exam Scraper",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins,
    allow_origin_regex=_settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["authorization", "content-type", "x-requested-with"],
    expose_headers=["content-type"],
    max_age=600,
)

app.include_router(health.router)
app.include_router(metrics.router)
app.include_router(scrape.router)
