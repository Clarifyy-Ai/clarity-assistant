"""Central AI decision gate and token budgets.

Deterministic work must never reach a provider. Call AI only when a feature
explicitly requires it and a remaining gap exists.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Literal

AiDecision = Literal["AI_REQUIRED", "AI_NOT_REQUIRED", "AI_NOT_PERMITTED", "AI_FALLBACK"]


class AiDecisionCode(str, Enum):
    REQUIRED = "AI_REQUIRED"
    NOT_REQUIRED = "AI_NOT_REQUIRED"
    NOT_PERMITTED = "AI_NOT_PERMITTED"
    FALLBACK = "AI_FALLBACK"


@dataclass(frozen=True)
class FeaturePolicy:
    feature: str
    prompt_id: str
    prompt_version: str
    ai_allowed: bool
    max_input_tokens: int
    max_output_tokens: int
    max_retries: int
    skip_secondary_on_quota: bool
    overfetch: int


FEATURE_POLICIES: dict[str, FeaturePolicy] = {
    "gov_exam_gap_fill": FeaturePolicy(
        feature="gov_exam_gap_fill",
        prompt_id="gov_exam_gap_fill",
        prompt_version="v3",
        ai_allowed=True,
        max_input_tokens=6_000,
        max_output_tokens=4_096,
        max_retries=1,
        skip_secondary_on_quota=True,
        overfetch=1,
    ),
    "paper_factory_mcq": FeaturePolicy(
        feature="paper_factory_mcq",
        prompt_id="paper_factory_mcq",
        prompt_version="v3",
        ai_allowed=True,
        max_input_tokens=6_000,
        max_output_tokens=4_096,
        max_retries=1,
        skip_secondary_on_quota=True,
        overfetch=1,
    ),
}


def decide_ai(
    *,
    feature: str,
    needed_count: int,
    permitted: bool,
    provider_configured: bool,
    official_mode: bool = False,
) -> AiDecision:
    """Decide whether a provider call is allowed for this operation."""
    if official_mode:
        return "AI_NOT_PERMITTED"
    policy = FEATURE_POLICIES.get(feature)
    if policy is not None and not policy.ai_allowed:
        return "AI_NOT_PERMITTED"
    if not permitted:
        return "AI_NOT_PERMITTED"
    if needed_count <= 0:
        return "AI_NOT_REQUIRED"
    if not provider_configured:
        return "AI_FALLBACK"
    return "AI_REQUIRED"


def mcq_output_token_budget(count: int, *, cap: int = 4_096) -> int:
    """Bound generation size: ~320 tokens per MCQ plus schema overhead."""
    n = max(1, int(count))
    return min(cap, 320 * n + 400)
