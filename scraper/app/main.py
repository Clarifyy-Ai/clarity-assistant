"""FastAPI entrypoint for the Clarity.AI gov-exam scraper."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import get_settings
from app.core.logger import configure_logging, get_logger
from app.routes import health, metrics, scrape


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    log = get_logger("startup")
    log.info("scraper_started", port=settings.port)
    yield
    log.info("scraper_stopped")


app = FastAPI(
    title="Clarity.AI Gov-Exam Scraper",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)

app.include_router(health.router)
app.include_router(metrics.router)
app.include_router(scrape.router)
