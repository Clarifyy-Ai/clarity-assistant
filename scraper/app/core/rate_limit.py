"""Async per-domain rate limiter (token bucket) + global concurrency semaphore."""
from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from urllib.parse import urlparse


class AsyncRateLimiter:
    """Per-domain token bucket. Refill rate = 1 / delay_seconds tokens/sec."""

    def __init__(self, delay_seconds: float, per_domain_concurrency: int) -> None:
        self._delay = max(delay_seconds, 0.0)
        self._last: dict[str, float] = defaultdict(float)
        self._locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        self._domain_sems: dict[str, asyncio.Semaphore] = defaultdict(
            lambda: asyncio.Semaphore(per_domain_concurrency)
        )

    @staticmethod
    def domain_of(url: str) -> str:
        return urlparse(url).netloc.lower()

    async def acquire(self, url: str) -> None:
        """Block until it's polite to make another request to this domain."""
        domain = self.domain_of(url)
        await self._domain_sems[domain].acquire()
        async with self._locks[domain]:
            now = time.monotonic()
            wait = self._last[domain] + self._delay - now
            if wait > 0:
                await asyncio.sleep(wait)
            self._last[domain] = time.monotonic()

    def release(self, url: str) -> None:
        self._domain_sems[self.domain_of(url)].release()
