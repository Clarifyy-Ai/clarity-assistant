/**
 * Polls a FastAPI scrape job's status every 2 seconds while it is in a
 * non-terminal state. Stops automatically on completed/failed/cancelled.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { scraperApi, type ScrapeJobState } from "@/lib/scraper/client";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export function useScrapeJob(jobId: string | null) {
  const [state, setState] = useState<ScrapeJobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!jobId) {
      setState(null);
      setError(null);
      stop();
      return;
    }
    let cancelled = false;

    const tick = async () => {
      try {
        const snap = await scraperApi.get(jobId);
        if (cancelled) return;
        setState(snap);
        setError(null);
        if (!TERMINAL.has(snap.status)) {
          timerRef.current = window.setTimeout(tick, 2000);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        timerRef.current = window.setTimeout(tick, 5000);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      stop();
    };
  }, [jobId, stop]);

  return { state, error };
}
