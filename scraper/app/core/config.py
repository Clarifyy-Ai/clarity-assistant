"""Application configuration loaded from environment variables."""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Strongly-typed environment configuration."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Supabase
    supabase_url: str = Field(..., alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(..., alias="SUPABASE_SERVICE_ROLE_KEY")
    supabase_jwks_url: str = Field(..., alias="SUPABASE_JWKS_URL")
    supabase_jwt_aud: str = Field("authenticated", alias="SUPABASE_JWT_AUD")

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

    # Service
    port: int = Field(8000, alias="PORT")
    log_level: str = Field("INFO", alias="LOG_LEVEL")


@lru_cache
def get_settings() -> Settings:
    """Cache settings across the process for cheap dependency injection."""
    return Settings()  # type: ignore[call-arg]
