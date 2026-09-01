"""Short-lived provider circuit breaker for quota / 429 storms."""
from __future__ import annotations

import threading
import time


class ProviderCircuit:
    def __init__(self, *, cooldown_seconds: float = 60.0, fail_threshold: int = 2) -> None:
        self.cooldown_seconds = cooldown_seconds
        self.fail_threshold = fail_threshold
        self._lock = threading.Lock()
        self._failures = 0
        self._open_until = 0.0
        self._quota_open = False

    def can_attempt(self) -> bool:
        with self._lock:
            return time.monotonic() >= self._open_until

    def opened_for_quota(self) -> bool:
        with self._lock:
            if time.monotonic() >= self._open_until:
                return False
            return self._quota_open

    def record_success(self) -> None:
        with self._lock:
            self._failures = 0
            self._open_until = 0.0
            self._quota_open = False

    def record_failure(self, *, quota: bool = False) -> None:
        with self._lock:
            if quota:
                self._failures = self.fail_threshold
                self._open_until = time.monotonic() + self.cooldown_seconds
                self._quota_open = True
                return
            self._failures += 1
            if self._failures >= self.fail_threshold:
                self._open_until = time.monotonic() + self.cooldown_seconds


gemini_circuit = ProviderCircuit(cooldown_seconds=60.0, fail_threshold=1)
