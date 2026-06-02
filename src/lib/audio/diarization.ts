// src/lib/audio/diarization.ts
//
// Speaker Diarization — processes utterances that have already been
// diarized by Deepgram (diarize=true query param in the WebSocket URL).
//
// Architecture note — why heuristics were REMOVED:
//   deepgramStream.ts converts Deepgram's numeric speaker index (0, 1...)
//   to "interviewer" | "candidate" before calling onUtterance(). By the time
//   an utterance reaches this module, utterance.speaker is already a string.
//   The previous INTERVIEWER_SIGNALS / CANDIDATE_ACK_PHRASES heuristics
//   checked utterance.speaker === "interviewer" on the first two lines and
//   returned early — meaning the heuristics NEVER executed. They are removed.
//
// Deepgram speaker convention used across this codebase:
//   speaker index 0 → "interviewer" (first voice Deepgram detects)
//   speaker index 1 → "candidate"
//   speaker index 2+ → additional participants (mapped to "candidate" for now)
//
// Filler word detection:
//   Deepgram marks filler words (um, uh, like, you know...) with
//   type:"filler" on each word when filler_words=true is set.
//   deepgramStream.ts counts these and adds filler_word_count and
//   filler_words_used to the utterance. This module provides analytics.

import type {
  TranscriptUtterance,
  DiarizationSegment,
  Speaker,
} from "@/types/audio.types";
import { useAudioStore } from "@/store/audioStore";
import { isInterviewerQuestionText } from "./interviewerQuestion";

/* ─── FILLER WORD CONSTANTS ──────────────────────────────────────────────── */

// Canonical list used for display labels and grouping.
// Deepgram's filler_words=true detects these automatically — this list
// is used for analytics grouping and UI display only.
export const KNOWN_FILLERS = new Set([
  "um", "uh", "like", "you know", "so", "right",
  "basically", "literally", "actually", "kind of", "sort of",
  "i mean", "you see", "well", "okay so",
]);

/* ─── TYPES ─────────────────────────────────────────────────────────────── */

export interface FillerWordAnalysis {
  /** Total filler word count across all utterances analysed */
  total_count:   number;
  /** Per-filler-word breakdown: { "um": 4, "like": 7, ... } */
  breakdown:     Record<string, number>;
  /** Filler words per minute at the current session duration */
  per_minute:    number;
  /** Whether the count is considered high (> 3 per minute) */
  is_concerning: boolean;
}

export interface SpeakerChangeEvent {
  from:      Speaker;
  to:        Speaker;
  at_ms:     number;
  utterance: TranscriptUtterance;
}

/* ─── SPEAKER CLASSIFICATION ─────────────────────────────────────────────── */

/**
 * Maps a completed TranscriptUtterance to its final Speaker label.
 *
 * This is intentionally simple — Deepgram's native diarization (diarize=true)
 * is authoritative. The previous heuristic-based overrides have been removed
 * because they fought Deepgram's ML model and were unreachable dead code
 * (speaker was already a string by the time this was called).
 *
 * The only remaining logic is the "first voice = interviewer" convention,
 * which matches how the WebSocket session is typically established
 * (interviewer speaks first to introduce themselves or ask an opener).
 */
export function classifySpeaker(utterance: TranscriptUtterance): Speaker {
  // Trust Deepgram's diarization — already converted from numeric index
  // by deepgramStream.ts handleMessage via getMajoritySpeaker().
  if (utterance.speaker === "interviewer") return "interviewer";
  if (utterance.speaker === "candidate")   return "candidate";

  // Only reached if speaker field is "unknown" or missing
  // In streaming + diarize=true, this should be rare
  return "unknown";
}

/* ─── FILLER WORD ANALYSIS ───────────────────────────────────────────────── */

/**
 * Computes filler word analytics from a list of final utterances.
 *
 * Uses filler_word_count and filler_words_used that deepgramStream.ts
 * populates from Deepgram's word-level type:"filler" flags.
 * Falls back to regex matching for utterances processed before the
 * filler_words flag was enabled.
 */
export function analyseFillerWords(
  utterances:        TranscriptUtterance[],
  sessionDurationMs: number,
): FillerWordAnalysis {
  const finalUtterances = utterances.filter((u) => u.is_final);
  const breakdown: Record<string, number> = {};
  let totalCount = 0;

  for (const u of finalUtterances) {
    if (u.filler_words_used && u.filler_words_used.length > 0) {
      // Primary: use Deepgram's type:"filler" data (accurate)
      for (const fw of u.filler_words_used) {
        const normalized = fw.toLowerCase().trim();
        breakdown[normalized] = (breakdown[normalized] ?? 0) + 1;
        totalCount++;
      }
    } else {
      // Fallback: regex scan for known fillers when Deepgram data unavailable
      const words = u.text.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (KNOWN_FILLERS.has(word)) {
          breakdown[word] = (breakdown[word] ?? 0) + 1;
          totalCount++;
        }
      }
    }
  }

  const durationMinutes = sessionDurationMs / 60_000;
  const perMinute       = durationMinutes > 0
    ? Math.round((totalCount / durationMinutes) * 10) / 10
    : 0;

  return {
    total_count:   totalCount,
    breakdown,
    per_minute:    perMinute,
    is_concerning: perMinute > 3,
  };
}

/**
 * Returns the top N most-used filler words for coaching display.
 */
export function getTopFillers(
  analysis: FillerWordAnalysis,
  topN = 3,
): Array<{ word: string; count: number }> {
  return Object.entries(analysis.breakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));
}

/* ─── QUESTION EXTRACTION ────────────────────────────────────────────────── */

/**
 * Returns the most recent interviewer question from the utterance list.
 * Walks backwards for O(1) in the typical case where the latest question
 * is near the end.
 */
export function extractLatestQuestion(
  utterances: TranscriptUtterance[],
): string | null {
  for (let i = utterances.length - 1; i >= 0; i--) {
    const u = utterances[i];
    if (u.speaker === "interviewer" && u.is_final && u.is_interviewer_question) {
      return u.text;
    }
  }
  // Fallback: interviewer phrasing that may not end with "?"
  for (let i = utterances.length - 1; i >= 0; i--) {
    const u = utterances[i];
    if (
      u.speaker === "interviewer" &&
      u.is_final &&
      isInterviewerQuestionText(u.text)
    ) {
      return u.text;
    }
  }
  return null;
}

/* ─── SPEAKER CHANGE DETECTION ───────────────────────────────────────────── */

export function detectSpeakerChange(
  newUtterance: TranscriptUtterance,
  segments:     DiarizationSegment[],
): boolean {
  if (segments.length === 0) return true;
  return segments[segments.length - 1].speaker !== newUtterance.speaker;
}

/**
 * Extracts speaker change events from an utterance list.
 * Useful for analytics ("interviewer spoke 8 times, candidate spoke 12 times").
 */
export function getSpeakerChangeEvents(
  utterances: TranscriptUtterance[],
): SpeakerChangeEvent[] {
  const events: SpeakerChangeEvent[] = [];
  for (let i = 1; i < utterances.length; i++) {
    const prev = utterances[i - 1];
    const curr = utterances[i];
    if (prev.speaker !== curr.speaker && curr.is_final) {
      events.push({
        from:      prev.speaker,
        to:        curr.speaker,
        at_ms:     curr.start_ms,
        utterance: curr,
      });
    }
  }
  return events;
}

/* ─── DIARIZATION SEGMENT BUILDER ────────────────────────────────────────── */

export function buildDiarizationSegment(
  utterance: TranscriptUtterance,
): DiarizationSegment {
  return {
    speaker:    utterance.speaker,
    start_ms:   utterance.start_ms,
    end_ms:     utterance.end_ms,
    text:       utterance.text,
    confidence: utterance.confidence,
  };
}

/* ─── PROCESS UTTERANCE (PIPELINE ENTRY POINT) ───────────────────────────── */

/**
 * Processes a final utterance through the diarization pipeline:
 * 1. Classifies speaker (trusts Deepgram — no heuristic override)
 * 2. Builds diarization segment
 * 3. Updates audio store
 * 4. Sets last question if utterance is a detected interviewer question
 */
export function processUtteranceForDiarization(
  utterance: TranscriptUtterance,
  options?: { forcedSpeaker?: TranscriptUtterance["speaker"] },
): TranscriptUtterance {
  const store  = useAudioStore.getState();
  const speaker = options?.forcedSpeaker ?? classifySpeaker(utterance);

  const enriched: TranscriptUtterance = {
    ...utterance,
    speaker,
    is_interviewer_question:
      speaker === "interviewer" && isInterviewerQuestionText(utterance.text),
  };

  store.setCurrentSpeaker(speaker);
  store.addDiarizationSegment(buildDiarizationSegment(enriched));
  store.addUtterance(enriched);

  if (enriched.is_interviewer_question) {
    store.setLastQuestion(enriched.text);
  }

  return enriched;
}

/* ─── TRANSCRIPT SPLIT BY SPEAKER ────────────────────────────────────────── */

export function getTranscriptBySpeaker(
  utterances: TranscriptUtterance[],
): { interviewer: string[]; candidate: string[] } {
  const interviewer: string[] = [];
  const candidate:   string[] = [];

  for (const u of utterances) {
    if (!u.is_final) continue;
    if (u.speaker === "interviewer") interviewer.push(u.text);
    else if (u.speaker === "candidate") candidate.push(u.text);
  }

  return { interviewer, candidate };
}

/* ─── SPEAKING TIME SUMMARY ──────────────────────────────────────────────── */

export function getSpeakingTimeSummary(
  segments: DiarizationSegment[],
): Record<Speaker, number> {
  const totals: Record<Speaker, number> = {
    interviewer: 0,
    candidate:   0,
    unknown:     0,
  };

  for (const seg of segments) {
    totals[seg.speaker] = (totals[seg.speaker] ?? 0) + (seg.end_ms - seg.start_ms);
  }

  return totals;
}

/**
 * Returns speaking ratio as a percentage per speaker.
 * Useful for the "Talk Ratio" coaching metric — candidates should
 * aim for 60-70% of speaking time.
 */
export function getSpeakingRatio(
  segments: DiarizationSegment[],
): { interviewer: number; candidate: number } {
  const totals  = getSpeakingTimeSummary(segments);
  const total   = totals.interviewer + totals.candidate + totals.unknown;
  if (total === 0) return { interviewer: 0, candidate: 0 };

  return {
    interviewer: Math.round((totals.interviewer / total) * 100),
    candidate:   Math.round((totals.candidate   / total) * 100),
  };
}
