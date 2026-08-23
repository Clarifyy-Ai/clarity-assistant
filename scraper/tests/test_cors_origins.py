from app.core.config import parse_cors_origins


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
