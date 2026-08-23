"""Source priority blender for government exam paper construction.

Priority (mock / hybrid modes):
  1. official_verified / previous_year
  2. verified_public_source
  3. approved_bank / internal_question_bank
  4. generated_practice (deterministic Python)
  5. ai_generated_practice

Official previous-year mode may only use tiers 1–3.
Never relabel generated/AI content as official.
"""
from __future__ import annotations

from typing import Any, Literal, Sequence

SourceType = Literal[
    "official_verified",
    "verified_public_source",
    "approved_bank",
    "generated_practice",
    "ai_generated_practice",
    "admin_uploaded",
    "internal_question_bank",
]

SOURCE_PRIORITY: tuple[SourceType, ...] = (
    "official_verified",
    "verified_public_source",
    "approved_bank",
    "internal_question_bank",
    "admin_uploaded",
    "generated_practice",
    "ai_generated_practice",
)

OFFICIAL_MODE_ALLOWED = frozenset(
    {
        "official_verified",
        "verified_public_source",
        "approved_bank",
        "internal_question_bank",
        "admin_uploaded",
    }
)

# Map legacy source_class + questions.source / source_type → canonical type
_LEGACY_SOURCE_MAP: dict[str, SourceType] = {
    "bank": "approved_bank",
    "previous_year": "official_verified",
    "generated": "generated_practice",
    "official_pyp": "official_verified",
    "official": "official_verified",
    "pyq": "official_verified",
    "deterministic_practice": "generated_practice",
    "clarify_practice_bank": "approved_bank",
    "original": "approved_bank",
    "internal": "approved_bank",
    "user_upload": "admin_uploaded",
    "ai_generated": "ai_generated_practice",
    "public_domain": "verified_public_source",
}


def normalize_source_type(
    *,
    source_type: str | None = None,
    source: str | None = None,
    source_class: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> SourceType:
    raw = (source_type or "").strip().lower()
    if raw in SOURCE_PRIORITY or raw in {
        "admin_uploaded",
        "internal_question_bank",
    }:
        return raw  # type: ignore[return-value]

    src = (source or "").strip().lower()
    if src in _LEGACY_SOURCE_MAP:
        return _LEGACY_SOURCE_MAP[src]
    if "ai" in src:
        return "ai_generated_practice"
    if "deterministic" in src or "generated" in src:
        return "generated_practice"
    if src in {"official_pyp", "official", "previous_year", "pyq"}:
        return "official_verified"

    sc = (source_class or "").strip().lower()
    if sc in _LEGACY_SOURCE_MAP:
        return _LEGACY_SOURCE_MAP[sc]

    meta = metadata or {}
    if meta.get("official_pyq") is True:
        return "official_verified"
    if meta.get("ai_generated") is True:
        return "ai_generated_practice"
    if meta.get("generated_by") == "deterministic_python":
        return "generated_practice"

    return "approved_bank"


def source_rank(source_type: str) -> int:
    try:
        return SOURCE_PRIORITY.index(source_type)  # type: ignore[arg-type]
    except ValueError:
        return len(SOURCE_PRIORITY)


def sort_by_source_priority(items: Sequence[Any], *, get_source) -> list[Any]:
    """Stable sort: higher-priority sources first, preserve relative order within tier."""
    decorated = [(source_rank(get_source(item)), idx, item) for idx, item in enumerate(items)]
    decorated.sort(key=lambda t: (t[0], t[1]))
    return [t[2] for t in decorated]


def allowed_for_mode(mode: str, source_type: str) -> bool:
    if mode == "official_previous":
        return source_type in OFFICIAL_MODE_ALLOWED
    return True


def map_to_legacy_source_class(source_type: str) -> str:
    """DB CHECK on gov_generated_paper_questions.source_class."""
    if source_type == "official_verified":
        return "previous_year"
    if source_type in {"generated_practice", "ai_generated_practice"}:
        return "generated"
    return "bank"


def summarize_source_mix(source_types: Sequence[str]) -> dict[str, int]:
    mix: dict[str, int] = {}
    for st in source_types:
        key = st or "approved_bank"
        mix[key] = mix.get(key, 0) + 1
    return mix


def resolve_paper_source(mix: dict[str, int], *, mode: str) -> str:
    if mode == "official_previous":
        return "official_verified"
    generated = mix.get("generated_practice", 0) + mix.get("ai_generated_practice", 0)
    bankish = (
        mix.get("official_verified", 0)
        + mix.get("verified_public_source", 0)
        + mix.get("approved_bank", 0)
        + mix.get("internal_question_bank", 0)
    )
    if generated > 0 and bankish > 0:
        return "hybrid_realistic_mock"
    if mix.get("ai_generated_practice", 0) > 0 and bankish == 0:
        return "ai_generated_practice"
    if mix.get("generated_practice", 0) > 0 and bankish == 0:
        return "generated_practice"
    if mix.get("official_verified", 0) > 0 and generated == 0:
        return "official_verified"
    return "approved_bank"
