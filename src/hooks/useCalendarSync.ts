import { useCallback, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { fetchEdge, fetchEdgeJson } from "@/lib/network/fetchEdge";
import { useAuthStore } from "@/store/userStore";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { agentLog70dd4b } from "@/lib/debug/agentLog70dd4b";

async function parseEdgeJson<T>(res: Response): Promise<T> {
  const text = await res.text().catch(() => "");
  const payload = text ? JSON.parse(text) : {};
  const data = (payload?.data ?? payload) as T & { error?: string; code?: string };
  if (!res.ok) {
    const err = new Error(
      data?.error ?? `Request failed (${res.status})`,
    ) as Error & { code?: string; status?: number };
    err.code = data?.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

const CALENDAR_UNAVAILABLE_MSG =
  "Google Calendar sync isn't available yet — server sync is not configured.";

function isCalendarUnavailableError(err: Error & { code?: string; status?: number }): boolean {
  if (err.status === 501 || err.code === "NOT_CONFIGURED") return true;
  const msg = (err.message ?? "").toLowerCase();
  return (
    msg.includes("501") ||
    msg.includes("not available") ||
    msg.includes("not configured") ||
    msg.includes("coming soon")
  );
}

/** Cross-mount cache — avoids hammering sync-calendar with 501 probes on every page. */
const SYNC_PROBE_TTL_MS = 5 * 60 * 1000;
let syncProbeCache: { available: boolean; checkedAt: number; unavailable: boolean } | null = null;
let syncProbeInflight: Promise<{ available: boolean; unavailable: boolean }> | null = null;

async function probeSyncAvailabilityCached(): Promise<{ available: boolean; unavailable: boolean }> {
  const now = Date.now();
  if (syncProbeCache && now - syncProbeCache.checkedAt < SYNC_PROBE_TTL_MS) {
    return {
      available: syncProbeCache.available,
      unavailable: syncProbeCache.unavailable,
    };
  }
  if (syncProbeInflight) return syncProbeInflight;

  syncProbeInflight = (async () => {
    try {
      await fetchEdgeJson("sync-calendar", { probe: true });
      syncProbeCache = { available: true, checkedAt: Date.now(), unavailable: false };
      return { available: true, unavailable: false };
    } catch (err) {
      const e = err as Error & { code?: string; status?: number };
      const unavailable = isCalendarUnavailableError(e);
      syncProbeCache = {
        available: false,
        checkedAt: Date.now(),
        unavailable,
      };
      // #region agent log
      agentLog70dd4b({
        hypothesisId: "H-INT-501",
        location: "useCalendarSync.ts:probe",
        message: "sync probe result",
        data: {
          syncAvailable: false,
          status: e.status ?? null,
          code: e.code ?? null,
          unavailable,
          cached: false,
        },
      });
      // #endregion
      return { available: false, unavailable };
    } finally {
      syncProbeInflight = null;
    }
  })();

  return syncProbeInflight;
}

// ─────────────────────────────────────────────────────────────────
// useCalendarSync
// Google OAuth connect/disconnect; event import only when sync-calendar is configured.
// ─────────────────────────────────────────────────────────────────

// Auth events that warrant a re-check of calendar connection status
const CONNECTION_CHECK_EVENTS: AuthChangeEvent[] = [
  "SIGNED_IN",
  "SIGNED_OUT",
  "USER_UPDATED",
];

export function useCalendarSync() {
  const { user } = useAuthStore();

  const [isSyncing,            setIsSyncing]            = useState(false);
  const [isDisconnecting,      setIsDisconnecting]      = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);
  const [lastSynced,           setLastSynced]           = useState<Date | null>(null);
  const [importedCount,        setImportedCount]        = useState<number | null>(null);
  const [error,                setError]                = useState<string | null>(null);
  const [isConnected,          setIsConnected]          = useState(false);
  const [syncAvailable,        setSyncAvailable]        = useState(
    () => syncProbeCache?.available === true,
  );
  const [isProbingSync,        setIsProbingSync]        = useState(
    () => !(syncProbeCache && Date.now() - syncProbeCache.checkedAt < SYNC_PROBE_TTL_MS),
  );

  // ── Check connection status ───────────────────────────────────
  // Uses GET on disconnect-calendar which returns { connected: boolean }.
  // Falls back to session provider_token if the edge call fails.
  const checkConnection = useCallback(async (): Promise<void> => {
    if (!user) {
      setIsConnected(false);
      setIsCheckingConnection(false);
      return;
    }
    try {
      const data = await fetchEdgeJson<{ connected?: boolean }>(
        "disconnect-calendar",
        undefined,
        { method: "GET" }
      );
      setIsConnected(!!data?.connected);
      // #region agent log
      agentLog70dd4b({
        hypothesisId: "H-SCH-001",
        location: "useCalendarSync.ts:checkConnection",
        message: "calendar connection status",
        data: { connected: !!data?.connected },
      });
      // #endregion
    } catch (err) {
      const e = err as Error & { code?: string; status?: number };
      // Auth/session failures must not fake a "Connected" state from a stale provider_token.
      if (e.status === 401 || e.code === "AUTH_REQUIRED" || e.code === "AUTH_EXPIRED" || e.code === "AUTH_INVALID") {
        setIsConnected(false);
        // #region agent log
        agentLog70dd4b({
          hypothesisId: "H-SCH-001",
          location: "useCalendarSync.ts:checkConnection:401",
          message: "calendar status auth failure",
          data: { status: e.status ?? null, code: e.code ?? null },
        });
        // #endregion
      } else {
        const { data: sessionData } = await supabase.auth.getSession();
        setIsConnected(!!sessionData?.session?.provider_token);
      }
    } finally {
      setIsCheckingConnection(false);
    }
  }, [user]);

  const probeSyncAvailability = useCallback(async (): Promise<void> => {
    setIsProbingSync(true);
    try {
      const fromCache =
        !!syncProbeCache && Date.now() - syncProbeCache.checkedAt < SYNC_PROBE_TTL_MS;
      const result = await probeSyncAvailabilityCached();
      setSyncAvailable(result.available);
      if (result.unavailable) setError(CALENDAR_UNAVAILABLE_MSG);
      // #region agent log
      agentLog70dd4b({
        hypothesisId: "H-INT-501",
        location: "useCalendarSync.ts:probe:resolved",
        message: "sync probe resolved",
        data: {
          syncAvailable: result.available,
          unavailable: result.unavailable,
          fromCache,
        },
      });
      // #endregion
    } finally {
      setIsProbingSync(false);
    }
  }, []);

  // ── Mount + auth state listener ───────────────────────────────
  useEffect(() => {
    checkConnection();
    void probeSyncAvailability();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        // FIX: Only re-check on meaningful events, not TOKEN_REFRESHED.
        // Avoids an unnecessary edge function call every ~60 minutes.
        if (CONNECTION_CHECK_EVENTS.includes(event)) {
          checkConnection();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Connect Google Calendar ───────────────────────────────────
  const connectGoogle = useCallback(async (): Promise<{ error: string | null }> => {
    if (!syncAvailable) {
      const msg = CALENDAR_UNAVAILABLE_MSG;
      setError(msg);
      return { error: msg };
    }
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes:      "https://www.googleapis.com/auth/calendar.readonly",
        redirectTo:  `${window.location.origin}/app/settings/integrations?calendar=connected`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      return { error: oauthError.message };
    }
    return { error: null };
  }, [syncAvailable]);

  // ── Sync calendar events ──────────────────────────────────────
  const syncNow = useCallback(async (): Promise<{
    imported: number;
    error: string | null;
  }> => {
    if (!user) return { imported: 0, error: "Not authenticated" };
    if (!syncAvailable) {
      setError(CALENDAR_UNAVAILABLE_MSG);
      return { imported: 0, error: CALENDAR_UNAVAILABLE_MSG };
    }
    setIsSyncing(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const providerToken = sessionData?.session?.provider_token;

      const body: Record<string, unknown> = {};
      if (providerToken) body.provider_token = providerToken;

      const res = await fetchEdge("sync-calendar", body);
      const data = await parseEdgeJson<{
        imported?: number;
        error?: string;
        code?: string;
      }>(res);

      if (data?.code === "TOKEN_REVOKED") {
        setIsConnected(false);
        const msg = "Google Calendar permission was revoked. Please reconnect.";
        setError(msg);
        return { imported: 0, error: msg };
      }

      if (data?.code === "NO_TOKEN") {
        setIsConnected(false);
        const msg = "Google Calendar not connected. Please connect it first.";
        setError(msg);
        return { imported: 0, error: msg };
      }

      if (data?.error) throw new Error(data.error);

      const count = data?.imported ?? 0;
      setLastSynced(new Date());
      setImportedCount(count);
      return { imported: count, error: null };

    } catch (err) {
      const e = err as Error & { code?: string; status?: number };
      if (e.code === "TOKEN_REVOKED" || e.code === "NO_TOKEN") {
        setIsConnected(false);
        const msg =
          e.code === "TOKEN_REVOKED"
            ? "Google Calendar permission was revoked. Please reconnect."
            : "Google Calendar not connected. Please connect it first.";
        setError(msg);
        return { imported: 0, error: msg };
      }
      // 501 / NOT_CONFIGURED — do not claim full Google Calendar sync works
      if (isCalendarUnavailableError(e)) {
        setSyncAvailable(false);
        setError(CALENDAR_UNAVAILABLE_MSG);
        return { imported: 0, error: CALENDAR_UNAVAILABLE_MSG };
      }
      const msg = err instanceof Error ? err.message : "Sync failed";
      setError(msg);
      return { imported: 0, error: msg };
    } finally {
      setIsSyncing(false);
    }
  }, [user, syncAvailable]);

  // ── Disconnect Google Calendar ────────────────────────────────
  const disconnect = useCallback(async (): Promise<{ error: string | null }> => {
    if (!user) return { error: "Not authenticated" };
    setIsDisconnecting(true);
    setError(null);

    try {
      const data = await fetchEdgeJson<{ success?: boolean; error?: string }>(
        "disconnect-calendar",
        undefined,
        { method: "POST" }
      );

      if (data?.success === false) {
        const msg = data?.error ?? "Failed to disconnect Google Calendar";
        setError(msg);
        return { error: msg };
      }

      setIsConnected(false);
      setLastSynced(null);
      setImportedCount(null);
      return { error: null };

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Disconnect failed";
      setError(msg);
      return { error: msg };
    } finally {
      setIsDisconnecting(false);
    }
  }, [user]);

  return {
    connectGoogle,
    syncNow,
    disconnect,
    checkConnection,
    probeSyncAvailability,
    isSyncing,
    isDisconnecting,
    isCheckingConnection,
    isProbingSync,
    isConnected,
    syncAvailable,
    lastSynced,
    importedCount,
    error,
  };
}
