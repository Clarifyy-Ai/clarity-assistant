"""Async AI client for MCQ generation: Gemini primary, OpenAI fallback."""
from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.logger import get_logger
from app.paper_factory.config import FactorySettings
from app.paper_factory.models import PaperFactoryError

log = get_logger("paper_factory.ai")

GEMINI_BASE = "https://generativelanguage.googleapis.com"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"

_TRANSIENT_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}


class TransientAIError(RuntimeError):
    """Retryable provider failure (rate limit, timeout, 5xx)."""


@dataclass(frozen=True)
class AIResponse:
    provider: str
    model: str
    questions: list[dict[str, Any]]


def extract_json_object(raw: str) -> dict[str, Any]:
    """Parse a JSON object from a model response, tolerating fences and prose."""
    text = (raw or "").strip()
    if not text:
        raise ValueError("Empty model response")

    fenced = re.search(r"```(?:json)?\s*(.+?)\s*```", text, re.S)
    if fenced:
        text = fenced.group(1).strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end <= start:
            raise ValueError("No JSON object found in model response")
        parsed = json.loads(text[start : end + 1])

    if not isinstance(parsed, dict):
        raise ValueError("Model response was not a JSON object")
    return parsed


def _questions_from_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw = payload.get("questions")
    if not isinstance(raw, list):
        # Some models return a bare list under a different key.
        for value in payload.values():
            if isinstance(value, list) and value and isinstance(value[0], dict):
                raw = value
                break
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, dict)]


class MCQGenerator:
    """Provider-routing MCQ generator with bounded retries and a shared HTTP client."""

    def __init__(self, settings: FactorySettings, client: httpx.AsyncClient | None = None) -> None:
        if not settings.has_ai_provider:
            raise PaperFactoryError(
                "AI_PROVIDER_UNCONFIGURED",
                "No AI provider configured. Set GEMINI_API_KEY or OPENAI_API_KEY.",
            )
        self.settings = settings
        self._client = client
        self._owns_client = client is None
        self._semaphore = asyncio.Semaphore(settings.max_concurrency)
        self.call_count = 0

    async def __aenter__(self) -> "MCQGenerator":
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.settings.request_timeout_seconds),
                http2=True,
            )
        return self

    async def __aexit__(self, *_exc: Any) -> None:
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise PaperFactoryError(
                "AI_CLIENT_CLOSED", "MCQGenerator must be used as an async context manager."
            )
        return self._client

    async def generate(self, prompt: str) -> AIResponse:
        """Generate MCQ candidates, falling back across providers on hard failure."""
        async with self._semaphore:
            errors: list[str] = []

            if self.settings.gemini_api_key:
                try:
                    return await self._call_gemini(prompt)
                except Exception as exc:  # noqa: BLE001 - fall through to next provider
                    errors.append(f"gemini: {exc}")
                    log.warning("paper_factory_gemini_failed", error=str(exc))

            if self.settings.openai_api_key:
                try:
                    return await self._call_openai(prompt)
                except Exception as exc:  # noqa: BLE001
                    errors.append(f"openai: {exc}")
                    log.warning("paper_factory_openai_failed", error=str(exc))

            raise PaperFactoryError(
                "PROVIDER_UNAVAILABLE",
                "All AI providers failed: " + "; ".join(errors),
                retryable=True,
            )

    @retry(
        retry=retry_if_exception_type(TransientAIError),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1.5, min=2, max=20),
        reraise=True,
    )
    async def _call_gemini(self, prompt: str) -> AIResponse:
        model = self.settings.gemini_model
        url = (
            f"{GEMINI_BASE}/{self.settings.gemini_api_version}/models/{model}:generateContent"
        )
        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": self.settings.temperature,
                "maxOutputTokens": 8192,
                "responseMimeType": "application/json",
            },
        }
        response = await self.client.post(
            url,
            params={"key": self.settings.gemini_api_key},
            json=payload,
            headers={"content-type": "application/json"},
        )
        self.call_count += 1
        self._raise_for_status(response, "gemini")

        body = response.json()
        candidates = body.get("candidates") or []
        if not candidates:
            raise TransientAIError(
                f"gemini returned no candidates ({body.get('promptFeedback')})"
            )
        parts = (candidates[0].get("content") or {}).get("parts") or []
        text = "".join(str(part.get("text") or "") for part in parts)
        payload_obj = extract_json_object(text)
        return AIResponse("gemini", model, _questions_from_payload(payload_obj))

    @retry(
        retry=retry_if_exception_type(TransientAIError),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1.5, min=2, max=20),
        reraise=True,
    )
    async def _call_openai(self, prompt: str) -> AIResponse:
        model = self.settings.openai_model
        response = await self.client.post(
            OPENAI_URL,
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": self.settings.temperature,
                "response_format": {"type": "json_object"},
            },
            headers={
                "authorization": f"Bearer {self.settings.openai_api_key}",
                "content-type": "application/json",
            },
        )
        self.call_count += 1
        self._raise_for_status(response, "openai")

        body = response.json()
        choices = body.get("choices") or []
        if not choices:
            raise TransientAIError("openai returned no choices")
        text = str((choices[0].get("message") or {}).get("content") or "")
        payload_obj = extract_json_object(text)
        return AIResponse("openai", model, _questions_from_payload(payload_obj))

    @staticmethod
    def _raise_for_status(response: httpx.Response, provider: str) -> None:
        if response.status_code in _TRANSIENT_STATUS:
            raise TransientAIError(
                f"{provider} transient HTTP {response.status_code}: {response.text[:200]}"
            )
        if response.status_code >= 400:
            raise RuntimeError(
                f"{provider} HTTP {response.status_code}: {response.text[:200]}"
            )
