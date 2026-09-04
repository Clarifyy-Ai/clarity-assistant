import { useCallback, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────
// useConfidenceScore
// Real-time speech confidence (0–100) from measured metrics.
// No metrics yet → null (never invent a mid-band 50).
// ─────────────────────────────────────────────────────────────────

interface ConfidenceInput {
  wpm: number;
  fillerRate: number; // per minute
  pauseCount: number; // long pauses (>3s)
  wordCount: number;
}

export function useConfidenceScore() {
  const [score, setScore] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const histRef = useRef<number[]>([]);

  const compute = useCallback(
    ({ wpm, fillerRate, pauseCount, wordCount }: ConfidenceInput): number => {
      const wpmScore =
        wpm >= 110 && wpm <= 160
          ? 35
          : wpm >= 90 && wpm <= 180
            ? 25
            : wpm >= 70 && wpm <= 200
              ? 15
              : 5;

      const fillerScore =
        fillerRate < 1 ? 30 : fillerRate < 2 ? 22 : fillerRate < 4 ? 14 : fillerRate < 6 ? 7 : 0;

      const pauseScore =
        pauseCount === 0 ? 20 : pauseCount <= 2 ? 15 : pauseCount <= 5 ? 8 : 2;

      const lengthScore =
        wordCount >= 80 ? 15 : wordCount >= 50 ? 11 : wordCount >= 25 ? 7 : wordCount >= 10 ? 3 : 0;

      const clamped = Math.min(100, Math.max(0, wpmScore + fillerScore + pauseScore + lengthScore));

      histRef.current = [...histRef.current.slice(-19), clamped];
      setHistory([...histRef.current]);
      setScore(clamped);

      return clamped;
    },
    [],
  );

  const sessionAverage = useCallback((): number | null => {
    if (!histRef.current.length) return null;
    return Math.round(
      histRef.current.reduce((s, v) => s + v, 0) / histRef.current.length,
    );
  }, []);

  const reset = useCallback((): void => {
    histRef.current = [];
    setHistory([]);
    setScore(null);
  }, []);

  return {
    score,
    history,
    compute,
    sessionAverage,
    reset,
  };
}
