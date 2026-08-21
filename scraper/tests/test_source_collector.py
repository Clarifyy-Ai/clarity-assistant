"""Unit tests for Python Government Exam source collector with circuit breaker, magic bytes validation, and semantic link extraction."""
import pytest
from app.scraper.collector import (
    CircuitBreaker,
    SafeSourceCollector,
    discover_semantic_links,
    validate_magic_bytes,
    sha256_hex,
)


def test_validate_magic_bytes():
    # PDF
    is_valid, mime, is_exec, err = validate_magic_bytes(b"%PDF-1.5 test content")
    assert is_valid is True
    assert mime == "application/pdf"
    assert is_exec is False

    # MZ / PE
    is_valid, mime, is_exec, err = validate_magic_bytes(b"MZ\x90\x00\x03")
    assert is_valid is False
    assert is_exec is True
    assert "MZ/PE" in (err or "")

    # ELF
    is_valid, mime, is_exec, err = validate_magic_bytes(b"\x7fELF\x02\x01")
    assert is_valid is False
    assert is_exec is True

    # Shebang
    is_valid, mime, is_exec, err = validate_magic_bytes(b"#!/bin/bash\nrm -rf /")
    assert is_valid is False
    assert is_exec is True


def test_circuit_breaker():
    cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=60.0)
    assert cb.can_attempt("upsc.gov.in") is True
    assert cb.get_state("upsc.gov.in") == "CLOSED"

    cb.record_failure("upsc.gov.in")
    cb.record_failure("upsc.gov.in")
    assert cb.get_state("upsc.gov.in") == "CLOSED"

    cb.record_failure("upsc.gov.in")
    assert cb.get_state("upsc.gov.in") == "OPEN"
    assert cb.can_attempt("upsc.gov.in") is False

    cb.record_success("upsc.gov.in")
    assert cb.get_state("upsc.gov.in") == "CLOSED"
    assert cb.can_attempt("upsc.gov.in") is True


@pytest.mark.anyio
async def test_safe_collector_rejects_unauthorized_and_coaching_urls():
    collector = SafeSourceCollector()

    res1 = await collector.collect("https://unknown-portal.org/paper.pdf")
    assert res1["ok"] is False
    assert res1["code"] == "FORBIDDEN_HOST"

    res2 = await collector.collect("https://testbook.com/pyq/ssc-cgl.pdf")
    assert res2["ok"] is False
    assert res2["code"] == "RESTRICTED_COACHING_PORTAL"


def test_discover_semantic_links():
    sample_html = """
    <html>
      <body>
        <table>
          <tr>
            <td>Civil Services Preliminary Examination 2024</td>
            <td><a href="https://upsc.gov.in/files/CSP_2024_P1.pdf">General Studies Paper 1</a></td>
          </tr>
          <tr>
            <td>Civil Services Preliminary Examination 2024 Answer Key</td>
            <td><a href="https://static.upsc.gov.in/files/CSP_2024_Key.pdf">Official Answer Key</a></td>
          </tr>
        </table>
      </body>
    </html>
    """
    discovered, missing = discover_semantic_links(sample_html, "https://upsc.gov.in")
    assert missing is False
    assert len(discovered) == 2
    assert discovered[0]["matched_domain"] == "upsc.gov.in"
    assert discovered[1]["document_type"] == "answer_key"

    # Empty sample
    discovered_empty, missing_empty = discover_semantic_links("<html><body>No links here</body></html>", "https://upsc.gov.in")
    assert missing_empty is True
    assert len(discovered_empty) == 0
