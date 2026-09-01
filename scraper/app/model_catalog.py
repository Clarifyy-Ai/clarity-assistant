"""Preference-ordered text models for Gemini / OpenAI / Anthropic.

Live discovery filters this list to IDs the project key can actually call.
"""
from __future__ import annotations

from typing import Iterable, Literal

CatalogProvider = Literal["gemini", "openai", "anthropic"]

DEFAULT_TEXT_MODEL = "gemini-2.5-flash"

GEMINI_TEXT_MODELS: tuple[str, ...] = (
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-pro",
    "gemini-pro-latest",
    "gemini-3.1-pro-preview",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
)

OPENAI_TEXT_MODELS: tuple[str, ...] = (
    "gpt-4o-mini",
    "gpt-4.1-mini",
    "gpt-4o",
    "gpt-4.1",
    "gpt-4-turbo",
)

ANTHROPIC_TEXT_MODELS: tuple[str, ...] = (
    "claude-3-haiku-20240307",
    "claude-3-5-haiku-20241022",
    "claude-3-5-sonnet-20241022",
    "claude-sonnet-4-20250514",
    "claude-3-7-sonnet-20250219",
)

APP_TO_API: dict[str, str] = {
    "gemini-flash": "gemini-2.5-flash",
    "gemini-pro": "gemini-2.5-pro",
    "claude": "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet": "claude-3-5-sonnet-20241022",
    "claude-3-haiku": "claude-3-haiku-20240307",
}

MAX_MODELS_PER_PROVIDER = 3
MAX_FALLBACK_MODELS = 9

_NON_TEXT = (
    "embed",
    "imagen",
    "tts",
    "whisper",
    "audio",
    "realtime",
    "transcribe",
    "moderation",
    "dall-e",
    "veo",
    "computer-use",
)


def strip_model_prefix(model_id: str) -> str:
    return model_id.strip().removeprefix("models/")


def provider_for_model(model: str) -> CatalogProvider | None:
    ident = strip_model_prefix(model).lower()
    if ident.startswith(("gpt-", "o1", "o3", "o4", "chatgpt")):
        return "openai"
    if ident.startswith("claude"):
        return "anthropic"
    if ident.startswith("gemini"):
        return "gemini"
    return None


def is_text_generation_model(model: str) -> bool:
    ident = strip_model_prefix(model).lower()
    if not ident:
        return False
    if any(token in ident for token in _NON_TEXT):
        return False
    if "image" in ident:
        return False
    return provider_for_model(ident) is not None


def rank_text_model(model: str) -> int:
    ident = strip_model_prefix(model)
    catalogs: dict[CatalogProvider, tuple[str, ...]] = {
        "gemini": GEMINI_TEXT_MODELS,
        "openai": OPENAI_TEXT_MODELS,
        "anthropic": ANTHROPIC_TEXT_MODELS,
    }
    provider = provider_for_model(ident)
    if provider:
        try:
            return catalogs[provider].index(ident)
        except ValueError:
            pass
    lowered = ident.lower()
    if "preview" in lowered or "-exp" in lowered or "experimental" in lowered:
        return 200
    if "lite" in lowered or "mini" in lowered or "haiku" in lowered:
        return 40
    if "flash" in lowered:
        return 50
    if "pro" in lowered or "sonnet" in lowered or "gpt-4" in lowered:
        return 80
    return 120


def merge_available(
    preferred: Iterable[str],
    available: set[str] | frozenset[str] | None,
) -> list[str]:
    preferred_list = list(preferred)
    if not available:
        return preferred_list
    out: list[str] = []
    seen: set[str] = set()
    for ident in preferred_list:
        if ident in available and ident not in seen and is_text_generation_model(ident):
            out.append(ident)
            seen.add(ident)
    extras = sorted(
        (
            ident
            for ident in available
            if ident not in seen and is_text_generation_model(ident)
        ),
        key=lambda ident: (rank_text_model(ident), ident),
    )
    for ident in extras:
        out.append(ident)
        seen.add(ident)
    return out


def build_fallback_chain(
    primary: str,
    *,
    gemini: bool = False,
    openai: bool = False,
    anthropic: bool = False,
    available_gemini: set[str] | None = None,
    available_openai: set[str] | None = None,
    available_anthropic: set[str] | None = None,
) -> list[str]:
    mapped = strip_model_prefix(APP_TO_API.get(primary, primary) if primary else DEFAULT_TEXT_MODEL) or DEFAULT_TEXT_MODEL
    primary_provider = provider_for_model(mapped)
    enabled: list[CatalogProvider] = []
    if gemini:
        enabled.append("gemini")
    if openai:
        enabled.append("openai")
    if anthropic:
        enabled.append("anthropic")

    order: list[CatalogProvider] = []
    if primary_provider and primary_provider in enabled:
        order.append(primary_provider)
    for provider in ("gemini", "openai", "anthropic"):
        if provider not in order and provider in enabled:
            order.append(provider)

    catalogs: dict[CatalogProvider, tuple[str, ...]] = {
        "gemini": GEMINI_TEXT_MODELS,
        "openai": OPENAI_TEXT_MODELS,
        "anthropic": ANTHROPIC_TEXT_MODELS,
    }
    available_map: dict[CatalogProvider, set[str] | None] = {
        "gemini": available_gemini,
        "openai": available_openai,
        "anthropic": available_anthropic,
    }
    keys = {"gemini": gemini, "openai": openai, "anthropic": anthropic}

    chain: list[str] = []
    seen: set[str] = set()

    def push(ident: str) -> None:
        if not ident or ident in seen or not is_text_generation_model(ident):
            return
        provider = provider_for_model(ident)
        if provider is None or not keys[provider]:
            return
        seen.add(ident)
        chain.append(ident)

    if primary_provider and keys.get(primary_provider):
        push(mapped)

    for provider in order:
        rest = merge_available(catalogs[provider], available_map[provider])[
            :MAX_MODELS_PER_PROVIDER
        ]
        for ident in rest:
            if len(chain) >= MAX_FALLBACK_MODELS:
                break
            push(ident)
        if len(chain) >= MAX_FALLBACK_MODELS:
            break

    if not chain and gemini:
        push(DEFAULT_TEXT_MODEL)
    return chain
