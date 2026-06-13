"""Abstract base class for source-specific scrapers."""
from __future__ import annotations

import abc
import re
from collections.abc import AsyncIterator

import httpx
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from app.core.config import Settings
from app.core.logger import get_logger
from app.core.rate_limit import AsyncRateLimiter
from app.models.schemas import ParsedPaper, PaperCandidate

_FILENAME_SAFE = re.compile(r"[^A-Za-z0-9._-]+")
log = get_logger(__name__)


def sanitize_filename(name: str, max_len: int = 120) -> str:
    """Strip path-traversal characters and limit filename length."""
    cleaned = _FILENAME_SAFE.sub("_", name).strip("._-")
    return (cleaned or "file")[:max_len]


class BaseScraper(abc.ABC):
    """Common fetch / retry / politeness scaffolding for source parsers."""

    exam_type: str = "UNKNOWN"

    def __init__(self, settings: Settings, limiter: AsyncRateLimiter) -> None:
        self.settings = settings
        self.limiter = limiter
        self.client = httpx.AsyncClient(
            http2=True,
            follow_redirects=True,
            timeout=httpx.Timeout(30.0, connect=10.0),
            headers={"User-Agent": settings.scrape_user_agent},
        )

    async def aclose(self) -> None:
        await self.client.aclose()

    async def fetch(self, url: str, *, expect_binary: bool = False) -> bytes | str:
        """Fetch a URL with politeness + retry. Returns text or bytes."""
        await self.limiter.acquire(url)
        try:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(3),
                wait=wait_exponential_jitter(initial=1, max=10),
                retry=retry_if_exception_type(
                    (httpx.TransportError, httpx.RemoteProtocolError)
                ),
                reraise=True,
            ):
                with attempt:
                    res = await self.client.get(url)
                    if res.status_code == 429:
                        retry_after = float(res.headers.get("Retry-After", "5"))
                        log.warning("rate_limited", url=url, retry_after=retry_after)
                        raise httpx.TransportError("429")
                    res.raise_for_status()
                    return res.content if expect_binary else res.text
        finally:
            self.limiter.release(url)
        return b"" if expect_binary else ""

    # ── Subclass contract ────────────────────────────────────────────────

    @abc.abstractmethod
    async def discover(
        self, year_from: int | None, year_to: int | None
    ) -> AsyncIterator[PaperCandidate]:
        """Yield paper candidates discovered from listing pages."""
        if False:  # pragma: no cover
            yield  # type: ignore[unreachable]

    @abc.abstractmethod
    async def parse(self, paper: PaperCandidate) -> ParsedPaper:
        """Download a paper and parse questions / answers / images."""
