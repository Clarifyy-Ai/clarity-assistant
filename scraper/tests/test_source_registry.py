"""Unit and integration tests for Government Exam Source Registry & Scraper Domain Allowlist."""
import pytest
from app.scraper.allowlist import (
    classify_source_url,
    is_official_document_url_allowed,
    is_official_exam_url_allowed,
    is_restricted_coaching_domain,
    OFFICIAL_EXAM_DOMAIN_ALLOWLIST,
    RESTRICTED_COACHING_DOMAINS,
)
from app.scraper.base import BaseScraper
from app.core.config import Settings
from app.core.rate_limit import AsyncRateLimiter


def test_official_domain_allowlist_contains_core_bodies():
    assert "ssc.gov.in" in OFFICIAL_EXAM_DOMAIN_ALLOWLIST
    assert "upsc.gov.in" in OFFICIAL_EXAM_DOMAIN_ALLOWLIST
    assert "ibps.in" in OFFICIAL_EXAM_DOMAIN_ALLOWLIST
    assert "rrbcdg.gov.in" in OFFICIAL_EXAM_DOMAIN_ALLOWLIST


def test_classify_source_url_across_all_classes():
    # Official
    cls, domain, allowed = classify_source_url("https://upsc.gov.in/examinations/prelims-2024.pdf")
    assert cls == "official"
    assert domain == "upsc.gov.in"
    assert allowed is True

    # Licensed
    cls, domain, allowed = classify_source_url(None, upload_type="licensed")
    assert cls == "licensed"
    assert domain is None
    assert allowed is True

    # Authorized Upload (Admin)
    cls, domain, allowed = classify_source_url(None, upload_type="admin")
    assert cls == "authorized_upload"
    assert domain is None
    assert allowed is True

    # User-Private
    cls, domain, allowed = classify_source_url(None, upload_type="user")
    assert cls == "user_private"
    assert domain is None
    assert allowed is False

    # Unsupported / Unknown domain
    cls, domain, allowed = classify_source_url("https://unknown-exam-portal.org/paper.pdf")
    assert cls == "unsupported"
    assert domain is None
    assert allowed is False


def test_reject_unauthorized_coaching_portals():
    for restricted in ("testbook.com", "byjus.com", "unacademy.com", "gradeup.co", "adda247.com"):
        assert is_restricted_coaching_domain(restricted) is True
        url = f"https://{restricted}/pyq/ssc-cgl.pdf"
        assert is_official_exam_url_allowed(url) is False
        assert is_official_document_url_allowed(url) is False
        cls, _, allowed = classify_source_url(url)
        assert cls == "unsupported"
        assert allowed is False


def test_dynamic_custom_allowlist():
    custom = ("bpsc.bih.nic.in", "mppsc.mp.gov.in")
    assert is_official_exam_url_allowed("https://bpsc.bih.nic.in/doc.pdf") is False
    assert is_official_exam_url_allowed("https://bpsc.bih.nic.in/doc.pdf", custom_allowlist=custom) is True
    cls, domain, allowed = classify_source_url(
        "https://bpsc.bih.nic.in/doc.pdf", custom_allowlist=custom
    )
    assert cls == "official"
    assert domain == "bpsc.bih.nic.in"
    assert allowed is True


@pytest.mark.anyio
async def test_scraper_base_rejects_unauthorized_url():
    class DummyScraper(BaseScraper):
        exam_type = "DUMMY"

        async def discover(self, year_from, year_to):
            return
            yield

        async def parse(self, paper):
            raise NotImplementedError

    settings = Settings(SUPABASE_URL="https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY="secret")
    limiter = AsyncRateLimiter(delay_seconds=0.01, per_domain_concurrency=1)
    scraper = DummyScraper(settings, limiter)

    with pytest.raises(PermissionError, match="not on the approved government exam allowlist"):
        await scraper.fetch("https://testbook.com/pyq/upsc.pdf")

    with pytest.raises(PermissionError, match="not on the approved government exam allowlist"):
        await scraper.fetch("https://random-unapproved-site.com/pyq.pdf")

    await scraper.aclose()
