"""Configuration for the government exam paper factory.

Deliberately independent of `app.core.config.Settings` so the factory can run as a
standalone CLI/worker with only Supabase + AI credentials, without requiring the
scraper service's internal-auth secrets.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class FactorySettings(BaseSettings):
    """Environment configuration for AI paper generation."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = Field(..., alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(..., alias="SUPABASE_SERVICE_ROLE_KEY")

    # Owner recorded on generated questions. Must be a real auth user because
    # `questions.uploaded_by` references it.
    system_user_id: str = Field("", alias="SYSTEM_USER_ID")

    # AI providers. Gemini is primary; OpenAI is the fallback when configured.
    gemini_api_key: str = Field("", alias="GEMINI_API_KEY")
    gemini_api_version: str = Field("v1beta", alias="GEMINI_API_VERSION")
    gemini_model: str = Field("gemini-2.5-flash", alias="PAPER_FACTORY_GEMINI_MODEL")
    openai_api_key: str = Field("", alias="OPENAI_API_KEY")
    openai_model: str = Field("gpt-4o-mini", alias="PAPER_FACTORY_OPENAI_MODEL")

    # Generation tuning
    batch_size: int = Field(8, alias="PAPER_FACTORY_BATCH_SIZE")
    max_concurrency: int = Field(4, alias="PAPER_FACTORY_CONCURRENCY")
    max_repair_rounds: int = Field(4, alias="PAPER_FACTORY_MAX_REPAIR_ROUNDS")
    request_timeout_seconds: float = Field(180.0, alias="PAPER_FACTORY_TIMEOUT_SECONDS")
    temperature: float = Field(0.85, alias="PAPER_FACTORY_TEMPERATURE")

    # Worker loop
    lease_seconds: int = Field(600, alias="PAPER_FACTORY_LEASE_SECONDS")
    poll_interval_seconds: float = Field(5.0, alias="PAPER_FACTORY_POLL_SECONDS")
    max_job_attempts: int = Field(3, alias="PAPER_FACTORY_MAX_JOB_ATTEMPTS")

    @field_validator("supabase_url", mode="after")
    @classmethod
    def _require_https(cls, v: str) -> str:
        from urllib.parse import urlparse

        parsed = urlparse(v.strip())
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError("SUPABASE_URL must be an HTTPS URL")
        return v.strip()

    @field_validator("supabase_service_role_key", mode="after")
    @classmethod
    def _require_service_key(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY must not be empty")
        return v.strip()

    @field_validator("batch_size")
    @classmethod
    def _validate_batch(cls, v: int) -> int:
        if v < 1 or v > 25:
            raise ValueError("PAPER_FACTORY_BATCH_SIZE must be between 1 and 25")
        return v

    @field_validator("max_concurrency")
    @classmethod
    def _validate_concurrency(cls, v: int) -> int:
        if v < 1 or v > 16:
            raise ValueError("PAPER_FACTORY_CONCURRENCY must be between 1 and 16")
        return v

    @field_validator("max_repair_rounds")
    @classmethod
    def _validate_repair(cls, v: int) -> int:
        if v < 0 or v > 10:
            raise ValueError("PAPER_FACTORY_MAX_REPAIR_ROUNDS must be between 0 and 10")
        return v

    @property
    def has_ai_provider(self) -> bool:
        return bool(self.gemini_api_key or self.openai_api_key)


@lru_cache
def get_factory_settings() -> FactorySettings:
    return FactorySettings()  # type: ignore[call-arg]
