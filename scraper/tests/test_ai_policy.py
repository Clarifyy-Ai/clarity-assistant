from app.ai_policy import FEATURE_POLICIES, FeaturePolicy, decide_ai, mcq_output_token_budget
from app.paper_factory.ai import truncate_prompt_for_policy
from app.paper_factory.generator import OVERFETCH


def test_official_mode_never_permits_ai() -> None:
    assert (
        decide_ai(
            feature="gov_exam_gap_fill",
            needed_count=13,
            permitted=True,
            provider_configured=True,
            official_mode=True,
        )
        == "AI_NOT_PERMITTED"
    )


def test_full_bank_does_not_require_ai() -> None:
    assert (
        decide_ai(
            feature="paper_factory_mcq",
            needed_count=0,
            permitted=True,
            provider_configured=True,
        )
        == "AI_NOT_REQUIRED"
    )


def test_gap_without_provider_is_fallback() -> None:
    assert (
        decide_ai(
            feature="gov_exam_gap_fill",
            needed_count=5,
            permitted=True,
            provider_configured=False,
        )
        == "AI_FALLBACK"
    )


def test_mcq_output_budget_scales_and_caps() -> None:
    assert mcq_output_token_budget(1) < mcq_output_token_budget(8)
    assert mcq_output_token_budget(100) == 4096


def test_small_batch_budget_stays_under_cap_and_overfetch_is_one() -> None:
    assert mcq_output_token_budget(5) < 4096
    assert OVERFETCH == 1
    assert OVERFETCH == FEATURE_POLICIES["paper_factory_mcq"].overfetch
    assert FEATURE_POLICIES["paper_factory_mcq"].overfetch == 1
    assert FEATURE_POLICIES["gov_exam_gap_fill"].overfetch == 1


def test_huge_prompt_is_truncated_to_input_budget() -> None:
    policy = FEATURE_POLICIES["paper_factory_mcq"]
    schema = '{"questions": [{"question_text": "stem", "correct_answer": "A"}]}'
    prompt = "START " + ("x" * 80_000) + "\n" + schema
    out = truncate_prompt_for_policy(prompt, policy)
    budget = policy.max_input_tokens * 4
    assert len(out) <= budget
    assert out.startswith("START ")
    assert "...[truncated to max_input_tokens]..." in out
    assert out.endswith(schema[-500:] if len(schema) > 500 else schema)


def test_short_prompt_is_left_unchanged() -> None:
    tiny = FeaturePolicy(
        feature="t",
        prompt_id="t",
        prompt_version="v1",
        ai_allowed=True,
        max_input_tokens=6_000,
        max_output_tokens=100,
        max_retries=1,
        skip_secondary_on_quota=True,
        overfetch=1,
    )
    prompt = "short enough"
    assert truncate_prompt_for_policy(prompt, tiny) == prompt
