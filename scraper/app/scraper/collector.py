"""Government Exam Source Collector with Circuit Breaker, Magic Bytes Validation, and Change Detection."""
from __future__ import annotations

import asyncio
import hashlib
import time
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
import httpx

from app.scraper.allowlist import (
    classify_source_url,
    is_official_document_url_allowed,
    is_official_exam_url_allowed,
    is_restricted_coaching_domain,
)

COLLECTOR_USER_AGENT = "CareerPilot-GovExamBot/1.0 (+https://trycareerpilot.com/bot; hello@trycareerpilot.com)"
DEFAULT_MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024  # 50MB
DEFAULT_TIMEOUT_SECONDS = 20.0
DEFAULT_MAX_RETRIES = 3


class CircuitBreaker:
    """Per-domain circuit breaker tracking consecutive failures."""

    def __init__(self, failure_threshold: int = 3, cooldown_seconds: float = 30.0) -> None:
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self._failures: dict[str, int] = {}
        self._last_failure_time: dict[str, float] = {}
        self._state: dict[str, str] = {}  # "CLOSED", "OPEN", "HALF_OPEN"

    def can_attempt(self, domain: str) -> bool:
        d = domain.lower()
        state = self._state.get(d, "CLOSED")
        if state == "CLOSED":
            return True

        last_fail = self._last_failure_time.get(d, 0.0)
        elapsed = time.monotonic() - last_fail
        if elapsed > self.cooldown_seconds:
            self._state[d] = "HALF_OPEN"
            return True
        return False

    def record_success(self, domain: str) -> None:
        d = domain.lower()
        self._failures[d] = 0
        self._state[d] = "CLOSED"

    def record_failure(self, domain: str) -> None:
        d = domain.lower()
        count = self._failures.get(d, 0) + 1
        self._failures[d] = count
        self._last_failure_time[d] = time.monotonic()
        if count >= self.failure_threshold:
            self._state[d] = "OPEN"

    def get_state(self, domain: str) -> str:
        return self._state.get(domain.lower(), "CLOSED")


global_circuit_breaker = CircuitBreaker()


def validate_magic_bytes(data: bytes) -> tuple[bool, str, bool, str | None]:
    """Returns (is_valid, mime_type, is_executable, error_message)."""
    if len(data) < 4:
        return False, "application/octet-stream", False, "Payload too small for signature verification"

    # MZ Header (Windows PE / Executable)
    if data[:2] == b"MZ":
        return False, "application/x-dosexec", True, "Unexpected executable binary (MZ/PE header)"

    # ELF Header (Linux binary)
    if data[:4] == b"\x7fELF":
        return False, "application/x-elf", True, "Unexpected executable binary (ELF header)"

    # Mach-O / Java Class
    if data[:4] in (b"\xca\xfe\xba\xbe", b"\xce\xfa\xed\xfe", b"\xcf\xfa\xed\xfe"):
        return False, "application/x-mach-binary", True, "Unexpected executable binary (Mach-O header)"

    # Shebang script `#!`
    if data[:2] == b"#!":
        return False, "text/x-shellscript", True, "Unexpected executable script (shebang)"

    # PDF header `%PDF-`
    if data[:5] == b"%PDF-":
        return True, "application/pdf", False, None

    # HTML header
    header_preview = data[:64].decode("utf-8", errors="ignore").lower().strip()
    if header_preview.startswith("<!doctype html") or header_preview.startswith("<html"):
        return True, "text/html", False, None

    # JSON header
    if header_preview.startswith("{") or header_preview.startswith("["):
        return True, "application/json", False, None

    return True, "application/octet-stream", False, None


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class SafeSourceCollector:
    """Safely downloads and audits official source documents."""

    def __init__(
        self,
        circuit_breaker: CircuitBreaker | None = None,
        max_bytes: int = DEFAULT_MAX_DOWNLOAD_BYTES,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        max_retries: int = DEFAULT_MAX_RETRIES,
        custom_allowlist: tuple[str, ...] | None = None,
    ) -> None:
        self.circuit_breaker = circuit_breaker or global_circuit_breaker
        self.max_bytes = max_bytes
        self.timeout = timeout
        self.max_retries = max_retries
        self.custom_allowlist = custom_allowlist

    async def collect(
        self,
        url: str,
        etag: str | None = None,
        last_modified: str | None = None,
        previous_hash: str | None = None,
    ) -> dict[str, Any]:
        cls, domain, allowed = classify_source_url(url, custom_allowlist=self.custom_allowlist)
        if not allowed or not domain:
            code = (
                "RESTRICTED_COACHING_PORTAL"
                if is_restricted_coaching_domain(urlparse(url).hostname or "")
                else "FORBIDDEN_HOST"
            )
            return {
                "ok": False,
                "code": code,
                "message": f"URL host is not permitted: {url}",
                "classification": cls,
            }

        if not self.circuit_breaker.can_attempt(domain):
            return {
                "ok": False,
                "code": "CIRCUIT_BREAKER_OPEN",
                "message": f"Circuit breaker OPEN for domain {domain}",
            }

        headers = {
            "User-Agent": COLLECTOR_USER_AGENT,
            "Accept": "application/pdf, text/html, application/json, */*",
        }
        if etag:
            headers["If-None-Match"] = etag
        if last_modified:
            headers["If-Modified-Since"] = last_modified

        last_error = None
        for attempt in range(1, self.max_retries + 1):
            try:
                async with httpx.AsyncClient(
                    follow_redirects=True,
                    timeout=httpx.Timeout(self.timeout, connect=10.0),
                    headers=headers,
                ) as client:
                    response = await client.get(url)

                    # 304 Not Modified
                    if response.status_code == 304:
                        self.circuit_breaker.record_success(domain)
                        return {
                            "ok": True,
                            "is_not_modified": True,
                            "code": "NOT_MODIFIED",
                            "evidence": {
                                "requested_url": url,
                                "final_url": str(response.url),
                                "status_code": 304,
                                "etag": response.headers.get("etag"),
                                "file_hash": previous_hash or "",
                                "byte_size": 0,
                            },
                        }

                    # Verify final redirected URL
                    final_url = str(response.url)
                    if final_url != url:
                        f_cls, f_domain, f_allowed = classify_source_url(
                            final_url, custom_allowlist=self.custom_allowlist
                        )
                        if not f_allowed:
                            self.circuit_breaker.record_failure(domain)
                            return {
                                "ok": False,
                                "code": "REDIRECT_FORBIDDEN_HOST",
                                "message": f"Redirect destination '{final_url}' is not on approved allowlist",
                            }

                    response.raise_for_status()

                    content_length = response.headers.get("content-length")
                    if content_length and int(content_length) > self.max_bytes:
                        self.circuit_breaker.record_failure(domain)
                        return {
                            "ok": False,
                            "code": "SIZE_LIMIT_EXCEEDED",
                            "message": f"Content-Length {content_length} exceeds limit {self.max_bytes}",
                        }

                    data = response.content
                    if len(data) > self.max_bytes:
                        self.circuit_breaker.record_failure(domain)
                        return {
                            "ok": False,
                            "code": "SIZE_LIMIT_EXCEEDED",
                            "message": f"Downloaded {len(data)} bytes exceeding limit {self.max_bytes}",
                        }

                    is_valid, mime, is_exec, err_msg = validate_magic_bytes(data)
                    if is_exec:
                        self.circuit_breaker.record_failure(domain)
                        return {
                            "ok": False,
                            "code": "UNEXPECTED_EXECUTABLE_CONTENT",
                            "message": err_msg or "Unexpected executable binary rejected",
                        }

                    file_hash = sha256_hex(data)
                    is_dup = bool(previous_hash and previous_hash == file_hash)

                    self.circuit_breaker.record_success(domain)
                    return {
                        "ok": True,
                        "payload": data,
                        "is_duplicate": is_dup,
                        "file_hash": file_hash,
                        "evidence": {
                            "requested_url": url,
                            "final_url": final_url,
                            "status_code": response.status_code,
                            "etag": response.headers.get("etag"),
                            "last_modified": response.headers.get("last-modified"),
                            "content_type": response.headers.get("content-type"),
                            "file_hash": file_hash,
                            "byte_size": len(data),
                            "user_agent": COLLECTOR_USER_AGENT,
                        },
                        "classification": cls,
                        "approved_domain": domain,
                    }
            except httpx.TimeoutException as exc:
                last_error = exc
                self.circuit_breaker.record_failure(domain)
                return {
                    "ok": False,
                    "code": "DOWNLOAD_TIMEOUT",
                    "message": f"Request timed out: {exc}",
                }
            except Exception as exc:
                last_error = exc
                if attempt < self.max_retries:
                    await asyncio.sleep(0.05 * (2**attempt))

        self.circuit_breaker.record_failure(domain)
        return {
            "ok": False,
            "code": "FETCH_FAILED",
            "message": f"Fetch failed after {self.max_retries} attempts: {last_error}",
        }


def discover_semantic_links(
    html: str,
    base_url: str,
    target_year: int | None = None,
    custom_allowlist: tuple[str, ...] | None = None,
) -> tuple[list[dict[str, Any]], bool]:
    """Semantic HTML link discovery. Returns (discovered_links, missing_expected_links)."""
    soup = BeautifulSoup(html, "lxml")
    discovered = []
    seen = set()

    for a in soup.select("a[href]"):
        href = a.get("href") or ""
        url = urljoin(base_url, href)
        if url in seen:
            continue

        cls, domain, allowed = classify_source_url(url, custom_allowlist=custom_allowlist)
        if not allowed or not domain:
            continue

        text = a.get_text(" ", strip=True)
        # Check table row or list item parent text
        parent = a.find_parent(["tr", "li", "div"])
        parent_text = parent.get_text(" ", strip=True) if parent else ""
        combined_text = f"{parent_text} {text} {url}".lower()

        # Determine doc type
        doc_type = "previous_paper"
        if "answer key" in combined_text or "solution" in combined_text:
            doc_type = "answer_key"
        elif "syllabus" in combined_text:
            doc_type = "syllabus"
        elif "notification" in combined_text or "notice" in combined_text:
            doc_type = "notification"

        year = None
        for word in combined_text.split():
            if word.isdigit() and len(word) == 4 and (word.startswith("20") or word.startswith("19")):
                year = int(word)
                break

        if target_year and year and year != target_year:
            continue

        seen.add(url)
        discovered.append({
            "url": url,
            "title": text or parent_text[:80] or "Official Paper",
            "year": year,
            "document_type": doc_type,
            "matched_domain": domain,
        })

    missing = len(discovered) == 0
    return discovered, missing
