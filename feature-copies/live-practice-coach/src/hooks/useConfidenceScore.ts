import { useCallback, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────
// useConfidenceScore
// Real-time speech confidence score (0–100) based on:
//   - WPM (ideal: 110–160)
//   - Filler rate (lower = better)
//   - Silence gaps (fewer long pauses = better)
//   - Utterance length (longer = more confident)
// ─────────────────────────────────────────────────────────────────

interface ConfidenceInput {
  wpm:         number;
  fillerRate:  number;   // per minute
  pauseCount:  number;   // long pauses (>3s)
  wordCount:   number;
}

export function useConfidenceScore() {
  const [score,   setScore]   = useState(50);
  const [history, setHistory] = useState<number[]>([]);
  const histRef               = useRef<number[]>([]);

  // ── Compute score from speech metrics ─────────────────────────

  const compute = useCallback(({
    wpm, fillerRate, pauseCount, wordCount,
  }: ConfidenceInput): number => {

    // WPM component (max 35 pts): ideal 110–160
    const wpmScore =
      wpm >= 110 && wpm <= 160 ? 35 :
      wpm >= 90  && wpm <= 180 ? 25 :
      wpm >= 70  && wpm <= 200 ? 15 : 5;

    // Filler component (max 30 pts)
    const fillerScore =
      fillerRate < 1  ? 30 :
      fillerRate < 2  ? 22 :
      fillerRate < 4  ? 14 :
      fillerRate < 6  ? 7  : 0;

    // Pause component (max 20 pts)
    const pauseScore =
      pauseCount === 0 ? 20 :
      pauseCount <= 2  ? 15 :
      pauseCount <= 5  ? 8  : 2;

    // Word count / length component (max 15 pts)
    const lengthScore =
      wordCount >= 80  ? 15 :
      wordCount >= 50  ? 11 :
      wordCount >= 25  ? 7  :
      wordCount >= 10  ? 3  : 0;

    const raw  = wpmScore + fillerScore + pauseScore + lengthScore;
    const clamped = Math.min(100, Math.max(0, raw));

    histRef.current = [...histRef.current.slice(-19), clamped];
    setHistory([...histRef.current]);
    setScore(clamped);

    return clamped;
  }, []);

  // ── Session average ───────────────────────────────────────────

  const sessionAverage = useCallback((): number => {
    if (!histRef.current.length) return 50;
    return Math.round(histRef.current.reduce((s, v) => s + v, 0) / histRef.current.length);
  }, []);

  const reset = useCallback((): void => {
    histRef.current = [];
    setHistory([]);
    setScore(50);
  }, []);

  return {
    score,
    history,
    compute,
    sessionAverage,
    reset,
  };
}
