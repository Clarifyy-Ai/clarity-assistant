import { useCallback, useEffect, useRef, useState } from "react";
import {
  isJobProgressTerminal,
  type JobProgress,
} from "@/lib/async/jobProgress";

type PollerOptions = {
  jobId: string | null | undefined;
  enabled?: boolean;
  /** Fetch latest job progress. */
  fetchProgress: (jobId: string, signal: AbortSignal) => Promise<JobProgress>;
  intervalMs?: number;
  maxIntervalMs?: number;
  onTerminal?: (progress: JobProgress) => void;
};

const activePollers = new Map<string, number>();

/**
 * Single poller per jobId (refcount). Exponential backoff while processing.
 * Does not invent progress percentages.
 */
export function useJobProgress(options: PollerOptions): {
  progress: JobProgress | null;
  error: string | null;
  isPolling: boolean;
  refresh: () => Promise<void>;
} {
  const {
    jobId,
    enabled = true,
    fetchProgress,
    intervalMs = 1500,
    maxIntervalMs = 8000,
    onTerminal,
  } = options;

  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const fetchRef = useRef(fetchProgress);
  fetchRef.current = fetchProgress;
  const onTerminalRef = useRef(onTerminal);
  onTerminalRef.current = onTerminal;
  const abortRef = useRef<AbortController | null>(null);
  const pollsRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!jobId) return;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    try {
      const next = await fetchRef.current(jobId, controller.signal);
      if (controller.signal.aborted) return;
      setProgress(next);
      setError(null);
      if (isJobProgressTerminal(next.status)) {
        onTerminalRef.current?.(next);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to load job status");
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId || !enabled) {
      setIsPolling(false);
      return;
    }

    const key = jobId;
    activePollers.set(key, (activePollers.get(key) ?? 0) + 1);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    pollsRef.current = 0;
    setIsPolling(true);

    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        void tick();
      }, delay);
    };

    const tick = async () => {
      if (cancelled) return;
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const next = await fetchRef.current(key, controller.signal);
        if (cancelled || controller.signal.aborted) return;
        setProgress(next);
        setError(null);
        if (isJobProgressTerminal(next.status)) {
          setIsPolling(false);
          onTerminalRef.current?.(next);
          return;
        }
        pollsRef.current += 1;
        const delay = Math.min(
          maxIntervalMs,
          intervalMs * 2 ** Math.min(pollsRef.current, 3),
        );
        schedule(delay);
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load job status");
        pollsRef.current += 1;
        schedule(Math.min(maxIntervalMs, intervalMs * 2));
      }
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      abortRef.current?.abort();
      const count = (activePollers.get(key) ?? 1) - 1;
      if (count <= 0) activePollers.delete(key);
      else activePollers.set(key, count);
      setIsPolling(false);
    };
  }, [jobId, enabled, intervalMs, maxIntervalMs]);

  return { progress, error, isPolling, refresh };
}

/** Test helper — active poller count for a job. */
export function __jobProgressPollerCount(jobId: string): number {
  return activePollers.get(jobId) ?? 0;
}
