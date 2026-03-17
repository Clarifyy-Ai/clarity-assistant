import { useCallback, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────
// useFillerWordDetection
// Scans incoming transcript text for filler words in real time.
// Returns running count, rate/min, and per-word breakdown.
// ─────────────────────────────────────────────────────────────────

const FILLER_WORDS = new Set([
  "um", "uh", "er", "ah", "like", "basically", "literally",
  "actually", "you know", "i mean", "sort of", "kind of",
  "right", "so", "okay", "well", "just", "honestly",
]);

interface FillerStats {
  total:    number;
  perWord:  Record<string, number>;
  ratePerMin: number;
}

export function useFillerWordDetection() {
  const [stats, setStats] = useState<FillerStats>({
    total:    0,
    perWord:  {},
    ratePerMin: 0,
  });

  const perWordRef  = useRef<Record<string, number>>({});
  const totalRef    = useRef(0);
  const startTime   = useRef<number | null>(null);

  // ── Scan a new transcript segment ────────────────────────────

  const scan = useCallback((text: string): void => {
    if (!text.trim()) return;
    if (!startTime.current) startTime.current = Date.now();

    const lower  = text.toLowerCase();
    let   found  = 0;

    // Multi-word fillers first
    for (const filler of FILLER_WORDS) {
      if (!filler.includes(" ")) continue;
      const occurrences = (lower.match(new RegExp(filler, "g")) ?? []).length;
      if (occurrences > 0) {
        perWordRef.current[filler] = (perWordRef.current[filler] ?? 0) + occurrences;
        found += occurrences;
      }
    }

    // Single-word fillers
    const words = lower.split(/\s+/);
    for (const word of words) {
      const clean = word.replace(/[^a-z]/g, "");
      if (FILLER_WORDS.has(clean)) {
        perWordRef.current[clean] = (perWordRef.current[clean] ?? 0) + 1;
        found += 1;
      }
    }

    totalRef.current += found;

    const elapsedMin = (Date.now() - (startTime.current ?? Date.now())) / 60_000;
    const rate = elapsedMin > 0 ? totalRef.current / elapsedMin : 0;

    setStats({
      total:      totalRef.current,
      perWord:    { ...perWordRef.current },
      ratePerMin: Math.round(rate * 10) / 10,
    });
  }, []);

  // ── Reset ─────────────────────────────────────────────────────

  const reset = useCallback((): void => {
    perWordRef.current = {};
    totalRef.current   = 0;
    startTime.current  = null;
    setStats({ total: 0, perWord: {}, ratePerMin: 0 });
  }, []);

  // ── Top N fillers for scorecard ───────────────────────────────

  const getTopFillers = useCallback((n = 5): { word: string; count: number }[] => {
    return Object.entries(perWordRef.current)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([word, count]) => ({ word, count }));
  }, []);

  return {
    stats,
    scan,
    reset,
    getTopFillers,
    total:      stats.total,
    ratePerMin: stats.ratePerMin,
  };
}
