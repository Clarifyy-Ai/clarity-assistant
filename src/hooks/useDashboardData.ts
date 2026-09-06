import { useCallback, useEffect, useRef, useState } from "react";
import { sessionsDB } from "@/lib/supabase/database";
import { subscribeFocusRecovery } from "@/lib/focusRecovery";
import {
  isStaleOrAbortError,
  toSafeUiError,
} from "@/lib/focusRecovery";
import { fetchSessionHistory } from "@/lib/session/sessionHistoryApi";
import { matchesCountBucket } from "@/lib/session/sessionCountPolicy";
import { sessionHistoryTypeLabel, sessionHistoryContextLine } from "@/lib/session/sessionHistoryTypes";

export type DashboardSessionRow = {
  id: string;
  type: string;
  status: string;
  overall_score: number | null;
  title: string | null;
  /** Role / objective context for assessments when present. */
  contextLine?: string | null;
  created_at: string;
  detailRoute: string;
};

const INITIAL_TIMEOUT_MS = 15_000;
const DASHBOARD_HISTORY_PAGE_SIZE = 50;

function mapHistoryToDashboardRow(
  item: Awaited<ReturnType<typeof fetchSessionHistory>>["items"][number],
): DashboardSessionRow {
  return {
    id: item.sourceId,
    type: sessionHistoryTypeLabel(item),
    status: item.status,
    overall_score: item.score ?? null,
    title: item.title,
    contextLine:
      item.sessionType === "assessment" ? sessionHistoryContextLine(item) : null,
    created_at: item.lastActivityAt || item.createdAt,
    detailRoute: item.detailRoute,
  };
}

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
  const bundleGen = useRef(0);

  const loadDashboardBundle = useCallback(
    async (mode: "initial" | "background") => {
      if (!userId) {
        setRecentInitialLoading(false);
        return;
      }
      const generation = ++bundleGen.current;
      countAbort.current?.abort();
      recentAbort.current?.abort();
      const controller = new AbortController();
      countAbort.current = controller;
      recentAbort.current = controller;

      if (mode === "initial") {
        setSessionCountError(null);
        setRecentInitialLoading(true);
        setRecentError(null);
      } else {
        setSessionCountRefreshing(true);
        setRecentRefreshing(true);
      }

      try {
        const history = await fetchSessionHistory({
          pageSize: DASHBOARD_HISTORY_PAGE_SIZE,
          sort: "newest",
        });
        if (generation !== bundleGen.current || controller.signal.aborted) return;

        const visible = history.items.filter((i) =>
          matchesCountBucket(i.status, "history_visible"),
        );
        let count = visible.length;
        if (history.hasMore) {
          const interviewCount = await sessionsDB.countByUserId(userId);
          count = Math.max(count, interviewCount);
        }

        setSessionCount(count);
        setSessionCountError(null);
        setRecentSessions(history.items.slice(0, 10).map(mapHistoryToDashboardRow));
        setRecentError(null);
        lastCountAt.current = Date.now();
        lastRecentAt.current = Date.now();
      } catch (err: unknown) {
        if (generation !== bundleGen.current || isStaleOrAbortError(err)) return;
        try {
          const [interviewCount, rows] = await Promise.all([
            sessionsDB.countByUserId(userId),
            sessionsDB.listRecentSummary(userId, 10),
          ]);
          if (generation !== bundleGen.current || controller.signal.aborted) return;
          setSessionCount(interviewCount);
          setSessionCountError(null);
          setRecentSessions(
            rows.map((r) => ({
              id: r.id,
              type: r.type,
              status: r.status,
              overall_score: r.overall_score,
              title: r.title,
              created_at: r.created_at,
              detailRoute: `/app/sessions/${r.id}`,
            })),
          );
          setRecentError(null);
        } catch {
          setSessionCountError(toSafeUiError(err, "Couldn't load session count"));
          setRecentError(toSafeUiError(err, "Couldn't load recent sessions"));
        }
      } finally {
        if (generation === bundleGen.current) {
          setSessionCountRefreshing(false);
          setRecentInitialLoading(false);
          setRecentRefreshing(false);
        }
      }
    },
    [userId],
  );

  const loadSessionCount = useCallback(
    async (mode: "initial" | "background") => {
      if (!userId) return;
      if (mode === "initial" && sessionCount === null && recentSessions.length === 0) {
        await loadDashboardBundle("initial");
        return;
      }
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
        // Prefer unified history page (same policy as Session History). Fall back to interview count.
        let count: number;
        try {
          const history = await fetchSessionHistory({ pageSize: 50, sort: "newest" });
          if (generation !== countGen.current || controller.signal.aborted) return;
          const visible = history.items.filter((i) =>
            matchesCountBucket(i.status, "history_visible"),
          );
          count = visible.length;
          if (history.hasMore) {
            // Lower bound when more pages exist — keep interview total as floor check.
            const interviewCount = await sessionsDB.countByUserId(userId);
            count = Math.max(count, interviewCount);
          }
        } catch {
          count = await sessionsDB.countByUserId(userId);
        }
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
    [userId, loadDashboardBundle, sessionCount, recentSessions.length],
  );

  const loadRecent = useCallback(
    async (mode: "initial" | "background") => {
      if (!userId) {
        setRecentInitialLoading(false);
        return;
      }
      if (mode === "initial" && sessionCount === null && recentSessions.length === 0) {
        await loadDashboardBundle("initial");
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
        const history = await fetchSessionHistory({ pageSize: 10, sort: "newest" });
        if (generation !== recentGen.current || controller.signal.aborted) return;
        setRecentSessions(
          history.items.map((item) => ({
            id: item.sourceId,
            type: sessionHistoryTypeLabel(item),
            status: item.status,
            overall_score: item.score ?? null,
            title: item.title,
            contextLine:
              item.sessionType === "assessment" ? sessionHistoryContextLine(item) : null,
            created_at: item.lastActivityAt || item.createdAt,
            detailRoute: item.detailRoute,
          })),
        );
        setRecentError(null);
        lastRecentAt.current = Date.now();
      } catch (err: unknown) {
        if (generation !== recentGen.current || isStaleOrAbortError(err)) return;
        // Fallback to interview-only recent if RPC unavailable.
        try {
          const rows = await sessionsDB.listRecentSummary(userId, 10);
          if (generation !== recentGen.current || controller.signal.aborted) return;
          setRecentSessions(
            rows.map((r) => ({
              id: r.id,
              type: r.type,
              status: r.status,
              overall_score: r.overall_score,
              title: r.title,
              created_at: r.created_at,
              detailRoute: `/app/sessions/${r.id}`,
            })),
          );
          setRecentError(null);
        } catch {
          setRecentError(toSafeUiError(err, "Couldn't load recent sessions"));
        }
      } finally {
        if (generation === recentGen.current) {
          setRecentInitialLoading(false);
          setRecentRefreshing(false);
        }
      }
    },
    [userId, loadDashboardBundle, sessionCount, recentSessions.length],
  );

  useEffect(() => {
    if (!userId) return;
    void loadDashboardBundle(
      sessionCount === null && recentSessions.length === 0 ? "initial" : "background",
    );
    return () => {
      countAbort.current?.abort();
      recentAbort.current?.abort();
    };
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
