"""Deterministic processing engines invoked by POST /v1/process."""

from __future__ import annotations

from app.engines.schemas import ProcessOperation

SUPPORTED_OPERATIONS: tuple[str, ...] = tuple(op.value for op in ProcessOperation)

__all__ = ["SUPPORTED_OPERATIONS", "ProcessOperation"]
