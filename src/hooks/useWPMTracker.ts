import { useCallback, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────
// useWPMTracker
// Calculates words-per-minute from incoming transcript segments.
// Maintains rolling 30-second window for current WPM display.
// ─────────────────────────────────────────────────────────────────

interface WPMStats {
  current:   number;    // WPM in last 30s
  average:   number;    // WPM across full session
  trend:     "up" | "down" | "stable";
}

export function useWPMTracker() {
  const [stats, setStats]       = useState<WPMStats>({ current: 0, average: 0, trend: "stable" });
  const wordLog                 = useRef<{ count: number; ts: number }[]>([]);
  const totalWords              = useRef(0);
  const sessionStart            = useRef<number | null>(null);
  const WINDOW_MS               = 30_000;

  // ── Feed a new transcript segment ────────────────────────────

  const feed = useCallback((text: string): void => {
    if (!text.trim()) return;
    const now   = Date.now();
    const count = text.trim().split(/\s+/).length;

    if (!sessionStart.current) sessionStart.current = now;

    wordLog.current.push({ count, ts: now });
    totalWords.current += count;

    // Prune entries older than window
    const cutoff = now - WINDOW_MS;
    wordLog.current = wordLog.current.filter((w) => w.ts > cutoff);

    const windowWords   = wordLog.current.reduce((s, w) => s + w.count, 0);
    const windowMinutes = Math.min(WINDOW_MS, now - sessionStart.current) / 60_000;
    const current       = windowMinutes > 0 ? Math.round(windowWords / windowMinutes) : 0;

    const elapsedMin    = (now - sessionStart.current) / 60_000;
    const average       = elapsedMin > 0 ? Math.round(totalWords.current / elapsedMin) : 0;

    const prev          = stats.current;
    const trend: WPMStats["trend"] =
      current > prev + 10 ? "up" :
      current < prev - 10 ? "down" : "stable";

    setStats({ current, average, trend });
  }, [stats.current]);

  // ── Reset ─────────────────────────────────────────────────────

  const reset = useCallback((): void => {
    wordLog.current    = [];
    totalWords.current = 0;
    sessionStart.current = null;
    setStats({ current: 0, average: 0, trend: "stable" });
  }, []);

  return {
    stats,
    feed,
    reset,
    current:  stats.current,
    average:  stats.average,
    trend:    stats.trend,
    isIdeal:  stats.current >= 110 && stats.current <= 160,
  };
}
