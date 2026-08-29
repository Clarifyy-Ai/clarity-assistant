import { useCallback, useEffect, useRef, useState } from "react";
import { sessionsDB } from "@/lib/supabase/database";
import { subscribeFocusRecovery } from "@/lib/focusRecovery";
import {
  isStaleOrAbortError,
  toSafeUiError,
} from "@/lib/focusRecovery";
import type { Tables } from "@/integrations/supabase/types";

export type DashboardSessionRow = Pick<
  Tables<"sessions">,
  "id" | "type" | "status" | "overall_score" | "title" | "created_at"
>;

const INITIAL_TIMEOUT_MS = 15_000;

export function useDashboardData(userId: string | undefined) {
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [sessionCountError, setSessionCountError] = useState<string | null>(null);
  const [sessionCountRefreshing, setSessionCountRefreshing] = useState(false);

  const [recentSessions, setRecentSessions] = useState<DashboardSessionRow[]>([]);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [recentInitialLoading, setRecentInitialLoading] = useState(true);
  const [recentRefreshing, setRecentRefreshing] = useState(false);

  const countGen = useRef(0);
  const recentGen = useRef(0);
  const countAbort = useRef<AbortController | null>(null);
  const recentAbort = useRef<AbortController | null>(null);
  const lastCountAt = useRef(0);
  const lastRecentAt = useRef(0);

  const loadSessionCount = useCallback(
    async (mode: "initial" | "background") => {
      if (!userId) return;
      const generation = ++countGen.current;
      countAbort.current?.abort();
      const controller = new AbortController();
      countAbort.current = controller;

      if (mode === "initial") {
        setSessionCountError(null);
      } else {
        setSessionCountRefreshing(true);
      }

      try {
        const count = await sessionsDB.countByUserId(userId);
        if (generation !== countGen.current || controller.signal.aborted) return;
        setSessionCount(count);
        setSessionCountError(null);
        lastCountAt.current = Date.now();
      } catch (err: unknown) {
        if (generation !== countGen.current || isStaleOrAbortError(err)) return;
        setSessionCountError(
          toSafeUiError(err, "Couldn't load session count"),
        );
      } finally {
        if (generation === countGen.current) {
          setSessionCountRefreshing(false);
        }
      }
    },
    [userId],
  );

  const loadRecent = useCallback(
    async (mode: "initial" | "background") => {
      if (!userId) {
        setRecentInitialLoading(false);
        return;
      }
      const generation = ++recentGen.current;
      recentAbort.current?.abort();
      const controller = new AbortController();
      recentAbort.current = controller;

      if (mode === "initial") {
        setRecentInitialLoading(true);
        setRecentError(null);
      } else {
        setRecentRefreshing(true);
      }

      try {
        const rows = await sessionsDB.listRecentSummary(userId, 10);
        if (generation !== recentGen.current || controller.signal.aborted) return;
        setRecentSessions(rows as DashboardSessionRow[]);
        setRecentError(null);
        lastRecentAt.current = Date.now();
      } catch (err: unknown) {
        if (generation !== recentGen.current || isStaleOrAbortError(err)) return;
        setRecentError(toSafeUiError(err, "Couldn't load recent sessions"));
      } finally {
        if (generation === recentGen.current) {
          setRecentInitialLoading(false);
          setRecentRefreshing(false);
        }
      }
    },
    [userId],
  );

  useEffect(() => {
    if (!userId) return;
    void loadSessionCount(sessionCount === null ? "initial" : "background");
    void loadRecent(recentSessions.length === 0 && recentInitialLoading ? "initial" : "background");
    return () => {
      countAbort.current?.abort();
      recentAbort.current?.abort();
    };
    // Only re-run when the authenticated user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (sessionCount !== null || !userId) return;
    const timeout = window.setTimeout(() => {
      setSessionCountError(
        "Dashboard data is taking too long to load. Please retry.",
      );
    }, INITIAL_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [sessionCount, userId]);

  useEffect(() => {
    return subscribeFocusRecovery((plan) => {
      if (!userId) return;
      if (plan.revalidate.includes("dashboardStats")) {
        void loadSessionCount("background");
      }
      if (plan.revalidate.includes("dashboardActivity")) {
        void loadRecent("background");
      }
    });
  }, [userId, loadSessionCount, loadRecent]);

  const retrySessionCount = useCallback(() => {
    setSessionCountError(null);
    void loadSessionCount(sessionCount === null ? "initial" : "background");
  }, [loadSessionCount, sessionCount]);

  const retryRecent = useCallback(() => {
    setRecentError(null);
    void loadRecent(recentSessions.length === 0 ? "initial" : "background");
  }, [loadRecent, recentSessions.length]);

  const backgroundRefreshing = sessionCountRefreshing || recentRefreshing;

  return {
    sessionCount,
    sessionCountError,
    sessionCountRefreshing,
    recentSessions,
    recentError,
    recentInitialLoading,
    recentRefreshing,
    backgroundRefreshing,
    retrySessionCount,
    retryRecent,
  };
}
