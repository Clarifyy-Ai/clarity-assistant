"""FastAPI entrypoint for the Clarity.AI gov-exam scraper."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.logger import configure_logging, get_logger
from app.paper_factory.config import get_factory_settings
from app.paper_factory.worker import worker_loop
from app.routes import (
    document_intelligence,
    health,
    metrics,
    paper_factory,
    scrape,
)
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
    background_tasks: list[asyncio.Task] = []

    if settings.scrape_daily_enabled:
        background_tasks.append(
            asyncio.create_task(
                daily_scrape_loop(settings, stop),
                name="daily-exam-scrape",
            )
        )

    factory_settings = get_factory_settings()
    start_factory_worker = (
        settings.paper_factory_embedded_worker and factory_settings.has_ai_provider
    )
    if start_factory_worker:
        background_tasks.append(
            asyncio.create_task(
                worker_loop(settings=factory_settings, stop=stop),
                name="paper-factory-worker",
            )
        )
    elif settings.paper_factory_embedded_worker:
        log.warning(
            "paper_factory_worker_skipped",
            reason="Set GEMINI_API_KEY or OPENAI_API_KEY to enable AI paper generation.",
        )

    log.info(
        "scraper_started",
        port=settings.port,
        cors_origins=settings.cors_origins,
        daily_scrape=settings.scrape_daily_enabled,
        daily_hour_utc=settings.scrape_daily_hour_utc,
        paper_factory_worker=start_factory_worker,
        has_ai_provider=factory_settings.has_ai_provider,
    )
    yield
    stop.set()
    for task in background_tasks:
        task.cancel()
    for task in background_tasks:
        try:
            await task
        except asyncio.CancelledError:
            pass
    log.info("scraper_stopped")


_settings = get_settings()
is_production = _settings.app_env.lower() == "production"
app = FastAPI(
    title="Clarity.AI Gov-Exam Scraper",
    version="1.0.0",
    docs_url=None if is_production else "/docs",
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins,
    allow_origin_regex=_settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=[
        "authorization",
        "content-type",
        "x-requested-with",
        "x-internal-timestamp",
        "x-internal-signature",
        "x-request-id",
    ],
    expose_headers=["content-type"],
    max_age=600,
)

app.include_router(health.router)
app.include_router(metrics.router)
app.include_router(scrape.router)
app.include_router(document_intelligence.router)
app.include_router(paper_factory.router)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    correlation_id = request.headers.get("x-request-id")
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": {
                "code": "REQUEST_VALIDATION_FAILED",
                "message": "The request payload is invalid.",
                "retryable": False,
                "stage": "request_validation",
                "correlation_id": correlation_id,
            },
            "details": exc.errors(),
        },
    )
