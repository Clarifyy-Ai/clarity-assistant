from app.model_catalog import (
    DEFAULT_TEXT_MODEL,
    GEMINI_TEXT_MODELS,
    MAX_MODELS_PER_PROVIDER,
    build_fallback_chain,
    is_text_generation_model,
    provider_for_model,
    strip_model_prefix,
)


def test_provider_prefix_routing() -> None:
    assert provider_for_model("gemini-3.5-flash") == "gemini"
    assert provider_for_model("gpt-4.1-mini") == "openai"
    assert provider_for_model("claude-sonnet-4-20250514") == "anthropic"
    assert provider_for_model("models/gemini-2.5-flash") == "gemini"
    assert strip_model_prefix("models/gemini-2.5-flash") == "gemini-2.5-flash"


def test_excludes_non_text_models() -> None:
    assert is_text_generation_model("gemini-2.5-flash") is True
    assert is_text_generation_model("text-embedding-004") is False
    assert is_text_generation_model("gemini-2.5-flash-image-preview") is False


def test_chain_includes_openai_and_anthropic() -> None:
    chain = build_fallback_chain(
        "gemini-flash",
        gemini=True,
        openai=True,
        anthropic=True,
    )
    assert chain[0] == "gemini-2.5-flash" or chain[0] == DEFAULT_TEXT_MODEL
    assert any(item.startswith("gpt-") for item in chain)
    assert any(item.startswith("claude-") for item in chain)
    assert len([item for item in chain if item.startswith("gemini-")]) <= MAX_MODELS_PER_PROVIDER


def test_live_availability_inserts_newer_models() -> None:
    chain = build_fallback_chain(
        DEFAULT_TEXT_MODEL,
        gemini=True,
        openai=True,
        anthropic=True,
        available_gemini={"gemini-3.5-flash", "gemini-2.5-flash"},
        available_openai={"gpt-4.1"},
        available_anthropic={"claude-sonnet-4-20250514"},
    )
    assert "gemini-3.5-flash" in chain
    assert "gpt-4.1" in chain
    assert "claude-sonnet-4-20250514" in chain
    assert "gpt-4o-mini" not in chain


def test_static_catalog_has_paid_and_flash_models() -> None:
    assert "gemini-2.5-pro" in GEMINI_TEXT_MODELS
    assert "gemini-2.5-flash" in GEMINI_TEXT_MODELS
