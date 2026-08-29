// Client-side live session checkpoint for refresh restore (no migration).

import type { TranscriptUtterance } from "@/types/audio.types";

const STORAGE_PREFIX = "clarify:live-checkpoint:";

export type LiveHintCheckpoint = {
  question: string;
  hint: string;
  timestamp: number;
};

export type LiveSessionCheckpoint = {
  v: 1;
  session_id: string;
  saved_at: number;
  full_transcript: string;
  utterances: TranscriptUtterance[];
  hint_history: LiveHintCheckpoint[];
  current_question: string;
  current_hint: string;
  elapsed_seconds: number;
};

function storageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`;
}

export function saveLiveSessionCheckpoint(checkpoint: LiveSessionCheckpoint): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(storageKey(checkpoint.session_id), JSON.stringify(checkpoint));
  } catch {
    /* quota / private mode */
  }
}

export function loadLiveSessionCheckpoint(sessionId: string): LiveSessionCheckpoint | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(storageKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LiveSessionCheckpoint>;
    if (!parsed || parsed.v !== 1 || parsed.session_id !== sessionId) return null;
    return {
      v: 1,
      session_id: sessionId,
      saved_at: Number(parsed.saved_at) || Date.now(),
      full_transcript: typeof parsed.full_transcript === "string" ? parsed.full_transcript : "",
      utterances: Array.isArray(parsed.utterances) ? (parsed.utterances as TranscriptUtterance[]) : [],
      hint_history: Array.isArray(parsed.hint_history)
        ? (parsed.hint_history as LiveHintCheckpoint[])
        : [],
      current_question: typeof parsed.current_question === "string" ? parsed.current_question : "",
      current_hint: typeof parsed.current_hint === "string" ? parsed.current_hint : "",
      elapsed_seconds: Math.max(0, Number(parsed.elapsed_seconds) || 0),
    };
  } catch {
    return null;
  }
}

export function clearLiveSessionCheckpoint(sessionId: string): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.removeItem(storageKey(sessionId));
  } catch {
    /* ignore */
  }
}
