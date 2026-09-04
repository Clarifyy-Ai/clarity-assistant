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
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from app.ai_circuit import gemini_circuit
from app.ai_policy import FEATURE_POLICIES, FeaturePolicy, mcq_output_token_budget
from app.core.logger import get_logger
from app.model_availability import get_available_models
from app.model_catalog import MAX_MODELS_PER_PROVIDER, build_fallback_chain, provider_for_model
from app.paper_factory.config import FactorySettings
from app.paper_factory.models import PaperFactoryError

log = get_logger("paper_factory.ai")

GEMINI_BASE = "https://generativelanguage.googleapis.com"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

_TRANSIENT_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}
_CHARS_PER_TOKEN = 4
_SCHEMA_TAIL_CHARS = 500
_TRUNCATE_MARKER = "\n...[truncated to max_input_tokens]...\n"
_MCQ_POLICY = FEATURE_POLICIES["paper_factory_mcq"]
_RETRY_ATTEMPTS = _MCQ_POLICY.max_retries + 1


class TransientAIError(RuntimeError):
    """Retryable provider failure (rate limit, timeout, 5xx)."""


def _is_quota_error(exc: BaseException) -> bool:
    text = str(exc).lower()
    return "429" in text or "resource_exhausted" in text or "quota" in text or "rate limit" in text


def _retry_transient_not_quota(exc: BaseException) -> bool:
    return isinstance(exc, TransientAIError) and not _is_quota_error(exc)


def _json_schema_tail(prompt: str, *, n: int = _SCHEMA_TAIL_CHARS) -> str | None:
    idx = prompt.rfind("{")
    while idx >= 0:
        region = prompt[idx:]
        lowered = region.lower()
        if len(region) >= 20 and (
            '"questions"' in lowered or '"properties"' in lowered or '"type"' in lowered
        ):
            return region[-n:] if len(region) > n else region
        idx = prompt.rfind("{", 0, idx)
    return None


def truncate_prompt_for_policy(
    prompt: str,
    policy: FeaturePolicy | None = None,
) -> str:
    """Cap prompt size at ~4 chars/token. Keep the start plus a JSON-schema tail when present."""
    policy = policy or _MCQ_POLICY
    budget = max(1, int(policy.max_input_tokens) * _CHARS_PER_TOKEN)
    if len(prompt) <= budget:
        return prompt

    schema_tail = _json_schema_tail(prompt)
    if schema_tail:
        reserved = len(_TRUNCATE_MARKER) + len(schema_tail)
        if reserved < budget:
            head = prompt[: budget - reserved]
            return head + _TRUNCATE_MARKER + schema_tail

    reserved = len(_TRUNCATE_MARKER)
    if reserved >= budget:
        return prompt[:budget]
    return prompt[: budget - reserved] + _TRUNCATE_MARKER


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
                "No AI provider configured. Set GOOGLE_API_KEY/GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.",
            )
        self.settings = settings
        self._client = client
        self._owns_client = client is None
        self._semaphore = asyncio.Semaphore(settings.max_concurrency)
        self.call_count = 0
        self._max_output_tokens = 2048

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

    async def generate(
        self, prompt: str, *, max_output_tokens: int | None = None
    ) -> AIResponse:
        """Generate MCQ candidates. Gemini quota/429 does not also spend OpenAI/Anthropic."""
        self._max_output_tokens = int(
            max_output_tokens or mcq_output_token_budget(8)
        )
        prompt = truncate_prompt_for_policy(prompt)
        async with self._semaphore:
            errors: list[str] = []
            available = await get_available_models(
                self.client,
                gemini_key=self.settings.resolved_gemini_api_key(),
                openai_key=self.settings.openai_api_key,
                anthropic_key=self.settings.anthropic_api_key,
                gemini_api_version=self.settings.gemini_api_version,
            )
            chain = build_fallback_chain(
                self.settings.gemini_model or self.settings.openai_model or self.settings.anthropic_model,
                gemini=bool(self.settings.resolved_gemini_api_key()),
                openai=bool(self.settings.openai_api_key),
                anthropic=bool(self.settings.anthropic_api_key),
                available_gemini=available.get("gemini"),
                available_openai=available.get("openai"),
                available_anthropic=available.get("anthropic"),
            )
            gemini_models = [
                model for model in chain if provider_for_model(model) == "gemini"
            ][:MAX_MODELS_PER_PROVIDER]
            secondary = [
                model for model in chain if provider_for_model(model) != "gemini"
            ]

            gemini_quota = False
            circuit_open = not gemini_circuit.can_attempt()
            if circuit_open and gemini_circuit.opened_for_quota():
                raise PaperFactoryError(
                    "PROVIDER_UNAVAILABLE",
                    "Gemini quota exhausted; skipping paid fallback to avoid double spend.",
                    retryable=True,
                )

            if self.settings.resolved_gemini_api_key() and gemini_circuit.can_attempt():
                quota_hits = 0
                for model in gemini_models or [self.settings.gemini_model]:
                    try:
                        result = await self._call_gemini(prompt, model=model)
                        gemini_circuit.record_success()
                        return result
                    except Exception as exc:  # noqa: BLE001
                        errors.append(f"gemini:{model}: {exc}")
                        log.warning(
                            "paper_factory_gemini_failed",
                            model=model,
                            error=str(exc),
                        )
                        if _is_quota_error(exc):
                            quota_hits += 1
                            continue
                        continue
                gemini_quota = bool(gemini_models) and quota_hits >= len(
                    gemini_models or [self.settings.gemini_model]
                )
                gemini_circuit.record_failure(quota=gemini_quota)
                if gemini_quota:
                    raise PaperFactoryError(
                        "PROVIDER_UNAVAILABLE",
                        "Gemini quota exhausted; skipping paid fallback to avoid double spend.",
                        retryable=True,
                    )
            elif self.settings.resolved_gemini_api_key():
                errors.append("gemini: circuit_open")

            if gemini_quota:
                raise PaperFactoryError(
                    "PROVIDER_UNAVAILABLE",
                    "Gemini quota exhausted; skipping paid fallback to avoid double spend.",
                    retryable=True,
                )

            for model in secondary:
                provider = provider_for_model(model)
                try:
                    if provider == "openai" and self.settings.openai_api_key:
                        return await self._call_openai(prompt, model=model)
                    if provider == "anthropic" and self.settings.anthropic_api_key:
                        return await self._call_anthropic(prompt, model=model)
                except Exception as exc:  # noqa: BLE001
                    errors.append(f"{provider}:{model}: {exc}")
                    log.warning(
                        "paper_factory_secondary_failed",
                        provider=provider,
                        model=model,
                        error=str(exc),
                    )

            raise PaperFactoryError(
                "PROVIDER_UNAVAILABLE",
                "All AI providers failed: " + "; ".join(errors),
                retryable=True,
            )

    @retry(
        retry=retry_if_exception(_retry_transient_not_quota),
        stop=stop_after_attempt(_RETRY_ATTEMPTS),
        wait=wait_exponential(multiplier=1.5, min=2, max=20),
        reraise=True,
    )
    async def _call_gemini(self, prompt: str, *, model: str | None = None) -> AIResponse:
        model = model or self.settings.gemini_model
        url = (
            f"{GEMINI_BASE}/{self.settings.gemini_api_version}/models/{model}:generateContent"
        )
        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": self.settings.temperature,
                "maxOutputTokens": self._max_output_tokens,
                "responseMimeType": "application/json",
            },
        }
        response = await self.client.post(
            url,
            params={"key": self.settings.resolved_gemini_api_key()},
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
        retry=retry_if_exception(_retry_transient_not_quota),
        stop=stop_after_attempt(_RETRY_ATTEMPTS),
        wait=wait_exponential(multiplier=1.5, min=2, max=20),
        reraise=True,
    )
    async def _call_openai(self, prompt: str, *, model: str | None = None) -> AIResponse:
        model = model or self.settings.openai_model
        response = await self.client.post(
            OPENAI_URL,
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": self.settings.temperature,
                "max_tokens": self._max_output_tokens,
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

    @retry(
        retry=retry_if_exception(_retry_transient_not_quota),
        stop=stop_after_attempt(_RETRY_ATTEMPTS),
        wait=wait_exponential(multiplier=1.5, min=2, max=20),
        reraise=True,
    )
    async def _call_anthropic(self, prompt: str, *, model: str | None = None) -> AIResponse:
        model = model or self.settings.anthropic_model
        response = await self.client.post(
            ANTHROPIC_URL,
            json={
                "model": model,
                "max_tokens": self._max_output_tokens,
                "temperature": self.settings.temperature,
                "messages": [{"role": "user", "content": prompt}],
            },
            headers={
                "x-api-key": self.settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
        )
        self.call_count += 1
        self._raise_for_status(response, "anthropic")

        body = response.json()
        blocks = body.get("content") or []
        text = "".join(
            str(block.get("text") or "")
            for block in blocks
            if isinstance(block, dict)
        )
        payload_obj = extract_json_object(text)
        return AIResponse("anthropic", model, _questions_from_payload(payload_obj))

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
