"""Government Exam Domain Allowlist and Source Classification for Python Scrapers."""
from __future__ import annotations

from urllib.parse import urlparse

OFFICIAL_EXAM_DOMAIN_ALLOWLIST = (
    "ssc.gov.in",
    "ssc.nic.in",
    "upsc.gov.in",
    "ibps.in",
    "rrbcdg.gov.in",
    "indianrailways.gov.in",
    "nta.ac.in",
    "ncs.gov.in",
    "employmentnews.gov.in",
)

OFFICIAL_DOCUMENT_HOST_ALLOWLIST = (
    *OFFICIAL_EXAM_DOMAIN_ALLOWLIST,
    "cdnbbsr.s3waas.gov.in",
    "documents.upsc.gov.in",
    "static.upsc.gov.in",
    "ibpsonline.ibps.in",
)

RESTRICTED_COACHING_DOMAINS = (
    "testbook.com",
    "byjus.com",
    "unacademy.com",
    "gradeup.co",
    "adda247.com",
    "careerwill.com",
    "exampundit.in",
    "oliveboard.in",
    "wifistudy.com",
    "guidely.in",
    "shiksha.com",
    "jagranjosh.com",
    "prepp.in",
    "embibe.com",
    "careerpower.in",
)


def hostname_of(url: str) -> str | None:
    try:
        parsed = urlparse(url)
        if parsed.scheme != "https":
            return None
        return (parsed.hostname or "").lower().strip()
    except Exception:
        return None


def host_matches_allowlist(hostname: str, allowlist: tuple[str, ...]) -> bool:
    host = hostname.lower()
    return any(host == entry or host.endswith(f".{entry}") for entry in allowlist)


def is_restricted_coaching_domain(hostname: str) -> bool:
    return host_matches_allowlist(hostname, RESTRICTED_COACHING_DOMAINS)


def is_official_exam_url_allowed(url: str, custom_allowlist: tuple[str, ...] | None = None) -> bool:
    host = hostname_of(url)
    if not host or is_restricted_coaching_domain(host):
        return False
    allowlist = custom_allowlist or OFFICIAL_EXAM_DOMAIN_ALLOWLIST
    return host_matches_allowlist(host, allowlist)


def is_official_document_url_allowed(url: str, custom_allowlist: tuple[str, ...] | None = None) -> bool:
    host = hostname_of(url)
    if not host or is_restricted_coaching_domain(host):
        return False
    allowlist = custom_allowlist or OFFICIAL_DOCUMENT_HOST_ALLOWLIST
    return host_matches_allowlist(host, allowlist)


def classify_source_url(
    url: str | None,
    upload_type: str | None = None,
    custom_allowlist: tuple[str, ...] | None = None,
) -> tuple[str, str | None, bool]:
    """Returns (classification, approved_domain, is_allowed).
    
    Classifications:
      - official
      - licensed
      - authorized_upload
      - user_private
      - unsupported
    """
    if upload_type == "licensed":
        return "licensed", None, True
    if upload_type == "admin":
        return "authorized_upload", None, True
    if upload_type == "user":
        return "user_private", None, False
    if not url:
        return "unsupported", None, False

    host = hostname_of(url)
    if not host or is_restricted_coaching_domain(host):
        return "unsupported", None, False

    allowlist = custom_allowlist or OFFICIAL_DOCUMENT_HOST_ALLOWLIST
    for entry in allowlist:
        if host == entry or host.endswith(f".{entry}"):
            return "official", entry, True

    return "unsupported", None, False
