"""Lightweight transcript cleanup when external STT is unavailable."""

from __future__ import annotations

import re
from typing import Any

from app.core.logger import get_logger
from app.engines.schemas import EngineError

log = get_logger("engines.speech_process")

_FILLERS = re.compile(
    r"\b(um+|uh+|er+|ah+|like,\s|you know,\s|i mean,\s)\b",
    re.I,
)
_WHITESPACE = re.compile(r"\s+")


def _segment_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [part.strip() for part in parts if part.strip()]


def run_speech_process(payload: dict[str, Any], *, operation_id: str, correlation_id: str) -> dict[str, Any]:
    log.info(
        "[SPEECH] process",
        operation_id=operation_id,
        correlation_id=correlation_id,
    )

    transcript = payload.get("transcript") or payload.get("text")
    has_audio = bool(payload.get("audio_metadata") or payload.get("audio_url") or payload.get("audio_base64"))

    if isinstance(transcript, str) and transcript.strip():
        cleaned = _WHITESPACE.sub(" ", transcript).strip()
        tagged = _FILLERS.sub("[filler]", cleaned)
        segments = _segment_sentences(tagged)
        filler_count = len(_FILLERS.findall(cleaned))

        log.info("[SPEECH] completed", operation_id=operation_id, correlation_id=correlation_id)
        return {
            "mode": "text_cleanup",
            "stt_performed": False,
            "cleaned_transcript": tagged,
            "segments": segments,
            "filler_count": filler_count,
            "word_count": len(cleaned.split()),
        }

    if has_audio:
        log.info(
            "[SPEECH] transcription_unavailable",
            operation_id=operation_id,
            correlation_id=correlation_id,
        )
        raise EngineError("TRANSCRIPTION_UNAVAILABLE", retryable=True)

    if payload.get("stt_external"):
        log.info("[SPEECH] completed", operation_id=operation_id, correlation_id=correlation_id, mode="external")
        return {
            "mode": "external_stt",
            "stt_performed": False,
            "message": "Speech-to-text is handled externally; no local transcript provided.",
        }

    raise EngineError("TRANSCRIPT_REQUIRED", retryable=False)
