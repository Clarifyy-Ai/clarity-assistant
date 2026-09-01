"""Live model listing for Gemini / OpenAI / Anthropic. Fail-open on errors."""
from __future__ import annotations

import threading
import time
from typing import Any

import httpx

from app.model_catalog import (
    is_text_generation_model,
    provider_for_model,
    strip_model_prefix,
)

_TTL_SECONDS = 10 * 60
_LIST_TIMEOUT = 1.5

_lock = threading.Lock()
_cached_at = 0.0
_cached: dict[str, set[str] | None] = {
    "gemini": None,
    "openai": None,
    "anthropic": None,
}


def _parse_gemini(body: Any) -> set[str]:
    out: set[str] = set()
    models = body.get("models") if isinstance(body, dict) else None
    if not isinstance(models, list):
        return out
    for row in models:
        if not isinstance(row, dict):
            continue
        ident = strip_model_prefix(str(row.get("name") or ""))
        methods = row.get("supportedGenerationMethods") or []
        if ident and "generateContent" in methods and is_text_generation_model(ident):
            out.add(ident)
    return out


def _parse_openai_like(body: Any, provider: str) -> set[str]:
    out: set[str] = set()
    rows = body.get("data") if isinstance(body, dict) else None
    if not isinstance(rows, list):
        return out
    for row in rows:
        if not isinstance(row, dict):
            continue
        ident = str(row.get("id") or "").strip()
        if is_text_generation_model(ident) and provider_for_model(ident) == provider:
            out.add(ident)
    return out


async def _list_gemini(client: httpx.AsyncClient, key: str, version: str) -> set[str] | None:
    try:
        response = await client.get(
            f"https://generativelanguage.googleapis.com/{version}/models",
            params={"key": key},
            timeout=_LIST_TIMEOUT,
        )
        if response.status_code != 200:
            return None
        return _parse_gemini(response.json())
    except Exception:  # noqa: BLE001
        return None


async def _list_openai(client: httpx.AsyncClient, key: str) -> set[str] | None:
    try:
        response = await client.get(
            "https://api.openai.com/v1/models",
            headers={"authorization": f"Bearer {key}"},
            timeout=_LIST_TIMEOUT,
        )
        if response.status_code != 200:
            return None
        return _parse_openai_like(response.json(), "openai")
    except Exception:  # noqa: BLE001
        return None


async def _list_anthropic(client: httpx.AsyncClient, key: str) -> set[str] | None:
    try:
        response = await client.get(
            "https://api.anthropic.com/v1/models",
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
            },
            timeout=_LIST_TIMEOUT,
        )
        if response.status_code != 200:
            return None
        return _parse_openai_like(response.json(), "anthropic")
    except Exception:  # noqa: BLE001
        return None


async def get_available_models(
    client: httpx.AsyncClient,
    *,
    gemini_key: str = "",
    openai_key: str = "",
    anthropic_key: str = "",
    gemini_api_version: str = "v1beta",
) -> dict[str, set[str] | None]:
    global _cached_at, _cached
    now = time.monotonic()
    with _lock:
        if now - _cached_at < _TTL_SECONDS:
            return {
                "gemini": _cached["gemini"],
                "openai": _cached["openai"],
                "anthropic": _cached["anthropic"],
            }

    gemini, openai, anthropic = await _gather_lists(
        client,
        gemini_key=gemini_key,
        openai_key=openai_key,
        anthropic_key=anthropic_key,
        gemini_api_version=gemini_api_version,
    )
    with _lock:
        _cached = {"gemini": gemini, "openai": openai, "anthropic": anthropic}
        _cached_at = time.monotonic()
    return {"gemini": gemini, "openai": openai, "anthropic": anthropic}


async def _none() -> None:
    return None


async def _gather_lists(
    client: httpx.AsyncClient,
    *,
    gemini_key: str,
    openai_key: str,
    anthropic_key: str,
    gemini_api_version: str,
) -> tuple[set[str] | None, set[str] | None, set[str] | None]:
    import asyncio

    gemini_task = (
        _list_gemini(client, gemini_key, gemini_api_version) if gemini_key else _none()
    )
    openai_task = _list_openai(client, openai_key) if openai_key else _none()
    anthropic_task = (
        _list_anthropic(client, anthropic_key) if anthropic_key else _none()
    )
    gemini, openai, anthropic = await asyncio.gather(
        gemini_task, openai_task, anthropic_task
    )
    return gemini, openai, anthropic


def reset_model_availability_cache() -> None:
    global _cached_at, _cached
    with _lock:
        _cached_at = 0.0
        _cached = {"gemini": None, "openai": None, "anthropic": None}
