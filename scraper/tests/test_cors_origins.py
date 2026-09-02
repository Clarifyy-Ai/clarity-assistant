from app.core.config import (
    parse_cors_origins,
    sanitize_production_cors,
    cors_regex_allows_preview_or_localhost,
    is_localhost_origin,
)


def test_parse_cors_csv():
    assert parse_cors_origins(
        "https://a.example,http://localhost:5173"
    ) == ["https://a.example", "http://localhost:5173"]


def test_parse_cors_json_array():
    assert parse_cors_origins(
        '["https://a.example","https://b.example"]'
    ) == ["https://a.example", "https://b.example"]


def test_parse_cors_empty_and_quoted():
    assert parse_cors_origins("") == []
    assert parse_cors_origins(None) == []
    assert parse_cors_origins('"https://a.example"') == ["https://a.example"]
    assert parse_cors_origins(["https://a.example", "  "]) == ["https://a.example"]


def test_localhost_origin_detection():
    assert is_localhost_origin("http://localhost:5173") is True
    assert is_localhost_origin("http://127.0.0.1:8000") is True
    assert is_localhost_origin("https://trycareerpilot.com") is False


def test_preview_regex_detection():
    assert cors_regex_allows_preview_or_localhost(r"^https://.*\.lovable\.app$") is True
    assert cors_regex_allows_preview_or_localhost(r"^https://trycareerpilot\.com$") is False


def test_production_cors_strips_localhost_and_preview_regex():
    origins, regex = sanitize_production_cors(
        "production",
        ["https://trycareerpilot.com", "http://localhost:5173"],
        r"^https://.*\.lovable\.app$",
    )
    assert origins == ["https://trycareerpilot.com"]
    assert regex == ""


def test_non_production_cors_keeps_localhost():
    origins, regex = sanitize_production_cors(
        "development",
        ["https://trycareerpilot.com", "http://localhost:5173"],
        r"^https://.*\.lovable\.app$",
    )
    assert "http://localhost:5173" in origins
    assert "lovable" in regex
