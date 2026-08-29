import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────
// useWPMTracker
// Accepts a transcript string and automatically updates WPM in real
// time using a rolling 30-second window.
// API is designed to match MockSession.tsx expectations:
//   const wpmHook = useWPMTracker(stt.transcript)
//   wpmHook.wpm   — current WPM
//   wpmHook.reset() — clear tracker
// ─────────────────────────────────────────────────────────────────

interface WPMStats {
  wpm:     number;   // current rolling WPM (alias: current)
  current: number;   // same as wpm
  average: number;
  trend:   "up" | "down" | "stable";
}

const WINDOW_MS = 30_000;

export function useWPMTracker(transcript = "") {
  const [stats, setStats] = useState<WPMStats>({
    wpm: 0, current: 0, average: 0, trend: "stable",
  });

  const wordLog      = useRef<{ count: number; ts: number }[]>([]);
  const totalWords   = useRef(0);
  const sessionStart = useRef<number | null>(null);
  const prevText     = useRef("");

  // ── Auto-track when transcript changes ───────────────────────
  useEffect(() => {
    if (!transcript.trim()) return;

    const prev = prevText.current;
    const diff = transcript.startsWith(prev)
      ? transcript.slice(prev.length)
      : transcript;

    prevText.current = transcript;
    if (!diff.trim()) return;

    const now   = Date.now();
    const count = diff.trim().split(/\s+/).filter(Boolean).length;
    if (count === 0) return;

    if (!sessionStart.current) sessionStart.current = now;

    wordLog.current.push({ count, ts: now });
    totalWords.current += count;

    // Prune entries outside the rolling window
    const cutoff = now - WINDOW_MS;
    wordLog.current = wordLog.current.filter((w) => w.ts > cutoff);

    const windowWords   = wordLog.current.reduce((s, w) => s + w.count, 0);
    const windowMinutes = Math.min(WINDOW_MS, now - sessionStart.current) / 60_000;
    const current       = windowMinutes > 0 ? Math.round(windowWords / windowMinutes) : 0;

    const elapsedMin = (now - sessionStart.current) / 60_000;
    const average    = elapsedMin > 0 ? Math.round(totalWords.current / elapsedMin) : 0;

    const prev_wpm = stats.wpm;
    const trend: WPMStats["trend"] =
      current > prev_wpm + 10 ? "up" :
      current < prev_wpm - 10 ? "down" : "stable";

    setStats({ wpm: current, current, average, trend });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript]);

  // ── Manual feed (for one-off text segments) ───────────────────
  const feed = useCallback((text: string): void => {
    if (!text.trim()) return;
    const now   = Date.now();
    const count = text.trim().split(/\s+/).filter(Boolean).length;

    if (!sessionStart.current) sessionStart.current = now;

    wordLog.current.push({ count, ts: now });
    totalWords.current += count;

    const cutoff = now - WINDOW_MS;
    wordLog.current = wordLog.current.filter((w) => w.ts > cutoff);

    const windowWords   = wordLog.current.reduce((s, w) => s + w.count, 0);
    const windowMinutes = Math.min(WINDOW_MS, now - sessionStart.current) / 60_000;
    const current       = windowMinutes > 0 ? Math.round(windowWords / windowMinutes) : 0;
    const elapsedMin    = (now - sessionStart.current) / 60_000;
    const average       = elapsedMin > 0 ? Math.round(totalWords.current / elapsedMin) : 0;
    const trend: WPMStats["trend"] =
      current > stats.wpm + 10 ? "up" :
      current < stats.wpm - 10 ? "down" : "stable";

    setStats({ wpm: current, current, average, trend });
  }, [stats.wpm]);

  // ── Reset ─────────────────────────────────────────────────────
  const reset = useCallback((): void => {
    wordLog.current    = [];
    totalWords.current = 0;
    sessionStart.current = null;
    prevText.current   = "";
    setStats({ wpm: 0, current: 0, average: 0, trend: "stable" });
  }, []);

  return {
    wpm:     stats.wpm,
    current: stats.current,
    average: stats.average,
    trend:   stats.trend,
    isIdeal: stats.wpm >= 110 && stats.wpm <= 160,
    feed,
    reset,
    stats,
  };
}
