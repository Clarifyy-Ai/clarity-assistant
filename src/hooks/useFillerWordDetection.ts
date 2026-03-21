import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────
// useFillerWordDetection
// Accepts an incoming transcript string and automatically scans
// it for filler words in real time.
// API is designed to match MockSession.tsx expectations:
//   const fillerHook = useFillerWordDetection(stt.interimTranscript)
//   fillerHook.totalCount — total fillers detected
//   fillerHook.counts     — Record<word, count>
//   fillerHook.reset()    — clear all counts
// ─────────────────────────────────────────────────────────────────

const FILLER_WORDS = new Set([
  "um", "uh", "er", "ah", "like", "basically", "literally",
  "actually", "you know", "i mean", "sort of", "kind of",
  "right", "so", "okay", "well", "just", "honestly",
]);

export function useFillerWordDetection(incomingText = "") {
  const [totalCount, setTotalCount] = useState(0);
  const [counts,     setCounts]     = useState<Record<string, number>>({});

  const countsRef     = useRef<Record<string, number>>({});
  const totalRef      = useRef(0);
  const startTimeRef  = useRef<number | null>(null);
  const prevTextRef   = useRef("");

  // ── Auto-scan when incomingText changes ──────────────────────
  useEffect(() => {
    if (!incomingText.trim()) return;

    // Only scan the NEW suffix since last update
    const prev = prevTextRef.current;
    const diff = incomingText.startsWith(prev)
      ? incomingText.slice(prev.length)
      : incomingText;

    prevTextRef.current = incomingText;
    if (!diff.trim()) return;

    if (!startTimeRef.current) startTimeRef.current = Date.now();

    const lower = diff.toLowerCase();
    let found   = 0;

    // Multi-word fillers first
    for (const filler of FILLER_WORDS) {
      if (!filler.includes(" ")) continue;
      const occurrences = (lower.match(new RegExp(filler, "g")) ?? []).length;
      if (occurrences > 0) {
        countsRef.current[filler] = (countsRef.current[filler] ?? 0) + occurrences;
        found += occurrences;
      }
    }

    // Single-word fillers
    const words = lower.split(/\s+/);
    for (const word of words) {
      const clean = word.replace(/[^a-z]/g, "");
      if (clean && FILLER_WORDS.has(clean)) {
        countsRef.current[clean] = (countsRef.current[clean] ?? 0) + 1;
        found += 1;
      }
    }

    if (found > 0) {
      totalRef.current += found;
      setTotalCount(totalRef.current);
      setCounts({ ...countsRef.current });
    }
  }, [incomingText]);

  // ── Manual scan (for one-off text) ───────────────────────────
  const scan = useCallback((text: string): void => {
    if (!text.trim()) return;
    if (!startTimeRef.current) startTimeRef.current = Date.now();

    const lower = text.toLowerCase();
    let found   = 0;

    for (const filler of FILLER_WORDS) {
      if (!filler.includes(" ")) continue;
      const occurrences = (lower.match(new RegExp(filler, "g")) ?? []).length;
      if (occurrences > 0) {
        countsRef.current[filler] = (countsRef.current[filler] ?? 0) + occurrences;
        found += occurrences;
      }
    }

    const words = lower.split(/\s+/);
    for (const word of words) {
      const clean = word.replace(/[^a-z]/g, "");
      if (clean && FILLER_WORDS.has(clean)) {
        countsRef.current[clean] = (countsRef.current[clean] ?? 0) + 1;
        found += 1;
      }
    }

    if (found > 0) {
      totalRef.current += found;
      setTotalCount(totalRef.current);
      setCounts({ ...countsRef.current });
    }
  }, []);

  // ── Reset ─────────────────────────────────────────────────────
  const reset = useCallback((): void => {
    countsRef.current  = {};
    totalRef.current   = 0;
    startTimeRef.current = null;
    prevTextRef.current  = "";
    setTotalCount(0);
    setCounts({});
  }, []);

  // ── Rate per minute ───────────────────────────────────────────
  const ratePerMin =
    startTimeRef.current
      ? Math.round((totalRef.current / ((Date.now() - startTimeRef.current) / 60_000)) * 10) / 10
      : 0;

  // ── Top N fillers ─────────────────────────────────────────────
  const getTopFillers = useCallback((n = 5): { word: string; count: number }[] => {
    return Object.entries(countsRef.current)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([word, count]) => ({ word, count }));
  }, []);

  return {
    totalCount,
    counts,
    scan,
    reset,
    ratePerMin,
    getTopFillers,
    // Legacy aliases kept for compatibility
    total: totalCount,
    stats: { total: totalCount, perWord: counts, ratePerMin },
  };
}
