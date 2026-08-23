"""Application configuration loaded from environment variables."""
from __future__ import annotations

import json
from functools import lru_cache
from urllib.parse import urlparse

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def parse_cors_origins(value: object) -> list[str]:
    """Accept CSV, JSON array, or empty — Render env vars are always strings.

    pydantic-settings JSON-decodes ``list[str]`` fields before validators run,
    so a plain CSV like ``https://a.com,https://b.com`` crashes startup.
    We therefore load CORS_ORIGINS as a string and parse it here.
    """
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        items = [str(item).strip().strip('"').strip("'") for item in value]
        return [item for item in items if item]
    text = str(value).strip()
    if not text:
        return []
    if text[0] in "\"'" and text[-1] == text[0]:
        text = text[1:-1].strip()
    if text.startswith("["):
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, list):
            return parse_cors_origins(parsed)
    return [part.strip().strip('"').strip("'") for part in text.split(",") if part.strip()]


class Settings(BaseSettings):
    """Strongly-typed environment configuration."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Supabase
    supabase_url: str = Field(..., alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(..., alias="SUPABASE_SERVICE_ROLE_KEY")
    supabase_jwks_url: str = Field(..., alias="SUPABASE_JWKS_URL")
    supabase_jwt_aud: str = Field("authenticated", alias="SUPABASE_JWT_AUD")
    app_env: str = Field("production", alias="APP_ENV")

    # Storage buckets
    storage_bucket_papers: str = Field("exam-papers", alias="STORAGE_BUCKET_PAPERS")
    storage_bucket_images: str = Field("question-images", alias="STORAGE_BUCKET_IMAGES")

    # Politeness
    scrape_delay_seconds: float = Field(2.0, alias="SCRAPE_DELAY_SECONDS")
    scrape_max_concurrency: int = Field(10, alias="SCRAPE_MAX_CONCURRENCY")
    scrape_per_domain_concurrency: int = Field(2, alias="SCRAPE_PER_DOMAIN_CONCURRENCY")
    scrape_user_agent: str = Field(
        "clarity-exam-scraper/1.0 (+admin)", alias="SCRAPE_USER_AGENT"
    )

    # CORS — keep as str so EnvSettingsSource does not JSON-decode and crash.
    # Use the ``cors_origins`` property for the parsed list.
    cors_origins_raw: str = Field(default="", alias="CORS_ORIGINS")
    cors_origin_regex: str = Field("", alias="CORS_ORIGIN_REGEX")

    # Service
    port: int = Field(8000, alias="PORT")
    log_level: str = Field("INFO", alias="LOG_LEVEL")

    # Internal service-to-service authentication. Secrets are rotated by
    # keeping the previous value during the cutover window.
    internal_auth_secret: str = Field(..., alias="DOCUMENT_INTELLIGENCE_AUTH_SECRET")
    internal_auth_previous_secret: str = Field("", alias="DOCUMENT_INTELLIGENCE_AUTH_PREVIOUS_SECRET")
    internal_auth_max_skew_seconds: int = Field(300, alias="DOCUMENT_INTELLIGENCE_AUTH_MAX_SKEW_SECONDS")
    internal_auth_replay_ttl_seconds: int = Field(600, alias="DOCUMENT_INTELLIGENCE_AUTH_REPLAY_TTL_SECONDS")
    internal_max_request_bytes: int = Field(5_242_880, alias="DOCUMENT_INTELLIGENCE_MAX_REQUEST_BYTES")

    # When true (default), drain document_processing_jobs inside the web process.
    document_intelligence_embedded_worker: bool = Field(
        True, alias="DOCUMENT_INTELLIGENCE_EMBEDDED_WORKER"
    )

    # Daily scrape (runs while this process is up; pg_cron covers hosted Edge)
    scrape_daily_enabled: bool = Field(True, alias="SCRAPE_DAILY_ENABLED")
    scrape_daily_hour_utc: int = Field(2, alias="SCRAPE_DAILY_HOUR_UTC")

    # When true (default), start the paper-factory job worker inside the web
    # process so Render Web Services drain gov_paper_generation_jobs.
    # Set PAPER_FACTORY_EMBEDDED_WORKER=false to run a dedicated Background Worker.
    paper_factory_embedded_worker: bool = Field(
        True, alias="PAPER_FACTORY_EMBEDDED_WORKER"
    )

    # When true (default), start the document-intelligence worker loop inside
    # the web process if worker_loop is available. Set false for a dedicated worker.
    document_worker_embedded: bool = Field(
        True, alias="DOCUMENT_WORKER_EMBEDDED"
    )
    document_worker_poll_seconds: float = Field(
        5.0, alias="DOCUMENT_WORKER_POLL_SECONDS"
    )
    document_worker_lease_seconds: int = Field(
        180, alias="DOCUMENT_WORKER_LEASE_SECONDS"
    )

    @property
    def cors_origins(self) -> list[str]:
        return parse_cors_origins(self.cors_origins_raw)

    @field_validator("supabase_url", "supabase_jwks_url", mode="after")
    @classmethod
    def _require_https_url(cls, v: str) -> str:
        parsed = urlparse(v.strip())
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError("Supabase URLs must use HTTPS")
        return v.strip()

    @field_validator("supabase_service_role_key", mode="after")
    @classmethod
    def _require_service_key(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY must not be empty")
        return v.strip()

    @field_validator("internal_auth_secret", mode="after")
    @classmethod
    def _require_internal_secret(cls, v: str) -> str:
        value = v.strip()
        if len(value) < 32:
            raise ValueError("DOCUMENT_INTELLIGENCE_AUTH_SECRET must be at least 32 characters")
        return value

    @field_validator("internal_auth_previous_secret", mode="after")
    @classmethod
    def _normalise_previous_secret(cls, v: str) -> str:
        return v.strip()

    @field_validator("internal_auth_max_skew_seconds", "internal_auth_replay_ttl_seconds")
    @classmethod
    def _validate_auth_window(cls, v: int) -> int:
        if v < 1 or v > 3600:
            raise ValueError("internal auth windows must be between 1 and 3600 seconds")
        return v

    @field_validator("internal_max_request_bytes")
    @classmethod
    def _validate_request_limit(cls, v: int) -> int:
        if v < 1024 or v > 10 * 1024 * 1024:
            raise ValueError("internal request limit must be between 1024 and 10485760 bytes")
        return v

    @field_validator("scrape_delay_seconds")
    @classmethod
    def _validate_delay(cls, v: float) -> float:
        if v < 0:
            raise ValueError("SCRAPE_DELAY_SECONDS must be non-negative")
        return v

    @field_validator("scrape_max_concurrency", "scrape_per_domain_concurrency")
    @classmethod
    def _validate_concurrency(cls, v: int) -> int:
        if v < 1:
            raise ValueError("scrape concurrency must be at least 1")
        return v

    @model_validator(mode="after")
    def _validate_origins(self) -> Settings:
        for origin in self.cors_origins:
            parsed = urlparse(origin)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError(f"Invalid CORS origin: {origin}")
        return self

    @field_validator("scrape_daily_hour_utc", mode="before")
    @classmethod
    def _clamp_hour(cls, v):
        try:
            hour = int(v)
        except (TypeError, ValueError):
            return 2
        return max(0, min(23, hour))


@lru_cache
def get_settings() -> Settings:
    """Cache settings across the process for cheap dependency injection."""
    return Settings()  # type: ignore[call-arg]
