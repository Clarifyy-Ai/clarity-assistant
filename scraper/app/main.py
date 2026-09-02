"""FastAPI entrypoint for the Clarity.AI gov-exam scraper."""
from __future__ import annotations

import asyncio
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings, is_production_app_env
from app.core.logger import configure_logging, get_logger
from app.hybrid import SERVICE_VERSION
from app.paper_factory.config import get_factory_settings
from app.paper_factory.system_user import ensure_system_user_id
from app.paper_factory.worker import worker_loop
from app.routes import (
    document_intelligence,
    gov_exams,
    health,
    metrics,
    operations,
    paper_factory,
    process,
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
    app.state.paper_factory_worker_running = False

    if settings.scrape_daily_enabled:
        background_tasks.append(
            asyncio.create_task(
                daily_scrape_loop(settings, stop),
                name="daily-exam-scrape",
            )
        )

    factory_settings = ensure_system_user_id(get_factory_settings())
    if factory_settings.worker_enabled:
        factory_settings.require_worker_configuration()
    start_factory_worker = (
        settings.paper_factory_embedded_worker
        and factory_settings.worker_mode == "embedded"
    )
    if start_factory_worker:
        factory_task = asyncio.create_task(
            worker_loop(settings=factory_settings, stop=stop),
            name="paper-factory-worker",
        )
        app.state.paper_factory_worker_running = True

        def _factory_worker_stopped(_task: asyncio.Task) -> None:
            app.state.paper_factory_worker_running = False

        factory_task.add_done_callback(_factory_worker_stopped)
        background_tasks.append(factory_task)
        if not factory_settings.has_ai_provider:
            log.info(
                "paper_factory_worker_bank_only",
                reason="No AI keys configured; worker will process bank-only / deterministic jobs.",
            )

    # Document intelligence embedded worker — only when enabled and secret present.
    start_document_worker = (
        settings.document_worker_embedded
        and bool(settings.internal_auth_secret)
    )
    if start_document_worker:
        try:
            from app.document_intelligence.worker import worker_loop as document_worker_loop
        except ImportError:
            document_worker_loop = None
            log.warning(
                "document_worker_skipped",
                reason="worker_loop not available in document_intelligence.worker",
            )
        if document_worker_loop is not None:
            background_tasks.append(
                asyncio.create_task(
                    document_worker_loop(
                        supabase_url=settings.supabase_url,
                        supabase_service_role_key=settings.supabase_service_role_key,
                        stop=stop,
                        poll_seconds=settings.document_worker_poll_seconds,
                        lease_seconds=settings.document_worker_lease_seconds,
                    ),
                    name="document-intelligence-worker",
                )
            )
            log.info("document_worker_embedded", enabled=True)
    else:
        log.info(
            "document_worker_embedded",
            enabled=False,
            reason="DOCUMENT_WORKER_EMBEDDED disabled",
        )

    log.info(
        "scraper_started",
        port=settings.port,
        cors_origins=settings.cors_origins,
        daily_scrape=settings.scrape_daily_enabled,
        daily_hour_utc=settings.scrape_daily_hour_utc,
        paper_factory_worker=start_factory_worker,
        document_worker=start_document_worker,
        has_ai_provider=factory_settings.has_ai_provider,
        service_version=SERVICE_VERSION,
    )
    yield
    stop.set()
    app.state.paper_factory_worker_running = False
    for task in background_tasks:
        task.cancel()
    for task in background_tasks:
        try:
            await task
        except asyncio.CancelledError:
            pass
    log.info("scraper_stopped")


_settings = get_settings()
is_production = is_production_app_env(_settings.app_env)
app = FastAPI(
    title="Clarity.AI Gov-Exam Scraper",
    version=SERVICE_VERSION,
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
        "x-correlation-id",
    ],
    expose_headers=["content-type"],
    max_age=600,
)


def _http_log_level(status_code: int) -> str:
    if status_code == 409:
        return "info"
    if status_code >= 500:
        return "error"
    if status_code >= 400:
        return "warning"
    return "info"


@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    correlation_id = (
        request.headers.get("x-correlation-id")
        or request.headers.get("x-request-id")
        or str(uuid.uuid4())
    )
    request.state.correlation_id = correlation_id
    started = time.perf_counter()
    response = await call_next(request)
    duration_ms = int(round((time.perf_counter() - started) * 1000))
    response.headers["x-request-id"] = correlation_id
    response.headers["x-correlation-id"] = correlation_id
    status_code = response.status_code
    http_log = get_logger("http")
    log_fn = getattr(http_log, _http_log_level(status_code))
    log_fn(
        "http_request",
        correlation_id=correlation_id,
        status=status_code,
        duration_ms=duration_ms,
        method=request.method,
        path=request.url.path,
    )
    return response

app.include_router(health.router)
app.include_router(metrics.router)
app.include_router(scrape.router)
app.include_router(document_intelligence.router)
app.include_router(paper_factory.router)
app.include_router(gov_exams.router)
app.include_router(operations.router)
app.include_router(process.router)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    correlation_id = getattr(request.state, "correlation_id", None)
    status_code = exc.status_code
    http_log = get_logger("http")
    log_fn = getattr(http_log, _http_log_level(status_code))
    log_fn(
        "http_exception",
        correlation_id=correlation_id,
        status=status_code,
        method=request.method,
        path=request.url.path,
    )
    detail = exc.detail
    headers = dict(exc.headers) if exc.headers else {}
    if correlation_id:
        headers["x-request-id"] = correlation_id
        headers["x-correlation-id"] = correlation_id
    return JSONResponse(
        status_code=status_code,
        content={"detail": detail},
        headers=headers or None,
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    correlation_id = getattr(request.state, "correlation_id", None)
    safe_errors = [
        {key: value for key, value in error.items() if key not in {"input", "ctx"}}
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        headers={"x-request-id": correlation_id} if correlation_id else None,
        content={
            "success": False,
            "error": {
                "code": "REQUEST_VALIDATION_FAILED",
                "message": "The request payload is invalid.",
                "retryable": False,
                "stage": "request_validation",
                "correlation_id": correlation_id,
            },
            "details": safe_errors,
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    correlation_id = getattr(request.state, "correlation_id", None)
    get_logger("http").error(
        "unhandled_exception",
        correlation_id=correlation_id,
        exception_type=type(exc).__name__,
        method=request.method,
        path=request.url.path,
    )
    headers = {}
    if correlation_id:
        headers["x-request-id"] = correlation_id
        headers["x-correlation-id"] = correlation_id
    return JSONResponse(
        status_code=500,
        content={
            "detail": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred.",
                "correlation_id": correlation_id,
            }
        },
        headers=headers or None,
    )
