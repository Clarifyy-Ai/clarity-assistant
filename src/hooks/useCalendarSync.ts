import { useCallback, useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { fetchEdge, fetchEdgeJson } from "@/lib/network/fetchEdge";
import { useAuthStore } from "@/store/userStore";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import {
  CALENDAR_PROBE_TIMEOUT_MS,
  CALENDAR_UNAVAILABLE_MSG,
  CALENDAR_VERIFICATION_PENDING_MSG,
  SYNC_PROBE_TTL_MS,
  clearSyncProbeCache,
  getSyncProbeCache,
  isCalendarOauthNotPublicError,
  isCalendarUnavailableError,
  probeSyncAvailabilityCached,
} from "@/lib/interviews/calendarProbe";

export type CalendarConnectionStatus =
  | "not_configured"
  | "verification_pending"
  | "disconnected"
  | "connected"
  | "reauth_required";

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

const CONNECTION_CHECK_EVENTS: AuthChangeEvent[] = [
  "SIGNED_IN",
  "SIGNED_OUT",
  "USER_UPDATED",
];

type WriteResult = {
  eventId: string | null;
  error: string | null;
  code?: string;
};

type DeleteResult = {
  error: string | null;
  code?: string;
};

const writeInflight = new Map<string, Promise<WriteResult>>();
const deleteInflight = new Map<string, Promise<DeleteResult>>();
let connectInflight: Promise<{ error: string | null }> | null = null;

export function useCalendarSync() {
  const { user } = useAuthStore();

  const [isSyncing,            setIsSyncing]            = useState(false);
  const [isDisconnecting,      setIsDisconnecting]      = useState(false);
  const [isConnecting,         setIsConnecting]         = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);
  const [lastSynced,           setLastSynced]           = useState<Date | null>(null);
  const [importedCount,        setImportedCount]        = useState<number | null>(null);
  const [error,                setError]                = useState<string | null>(null);
  const [connectionStatus,     setConnectionStatus]     = useState<CalendarConnectionStatus>("disconnected");
  const [googleEmail,          setGoogleEmail]          = useState<string | null>(null);
  const [syncAvailable,        setSyncAvailable]        = useState(
    () => getSyncProbeCache()?.available === true,
  );
  const [connectAllowed,       setConnectAllowed]       = useState(
    () => getSyncProbeCache()?.connectAllowed === true,
  );
  const [isProbingSync,        setIsProbingSync]        = useState(
    () => {
      const cached = getSyncProbeCache();
      return !(cached && Date.now() - cached.checkedAt < SYNC_PROBE_TTL_MS);
    },
  );
  const connectingRef = useRef(false);

  const isConnected = connectionStatus === "connected";
  const reauthRequired = connectionStatus === "reauth_required";
  const verificationPending = connectionStatus === "verification_pending";

  const applyUnavailable = useCallback(() => {
    setSyncAvailable(false);
    setConnectAllowed(false);
    setConnectionStatus("not_configured");
    setError(CALENDAR_UNAVAILABLE_MSG);
  }, []);

  const applyVerificationPending = useCallback(() => {
    setSyncAvailable(true);
    setConnectAllowed(false);
    setConnectionStatus((prev) =>
      prev === "connected" || prev === "reauth_required"
        ? prev
        : "verification_pending",
    );
    setError(null);
  }, []);

  const checkConnection = useCallback(async (): Promise<void> => {
    if (!user) {
      setConnectionStatus("disconnected");
      setGoogleEmail(null);
      setIsCheckingConnection(false);
      return;
    }
    try {
      const data = await fetchEdgeJson<{
        connected?: boolean;
        status?: string;
        reauth_required?: boolean;
        google_email?: string | null;
        configured?: boolean;
        code?: string;
      }>(
        "disconnect-calendar",
        undefined,
        { method: "GET", timeoutMs: CALENDAR_PROBE_TIMEOUT_MS },
      );

      if (data?.configured === false) {
        setSyncAvailable(false);
        setConnectAllowed(false);
        setConnectionStatus("not_configured");
        setGoogleEmail(null);
        return;
      }

      if (data?.configured === true) {
        setSyncAvailable(true);
        setError(null);
      }

      if (data?.reauth_required || data?.status === "reauth_required") {
        setConnectionStatus("reauth_required");
        setGoogleEmail(typeof data?.google_email === "string" ? data.google_email : null);
        return;
      }

      if (data?.connected === true && data?.status !== "disconnected") {
        setConnectionStatus("connected");
        setGoogleEmail(typeof data?.google_email === "string" ? data.google_email : null);
        return;
      }

      setGoogleEmail(null);
      const probe = getSyncProbeCache();
      if (probe?.available && probe.connectAllowed === false) {
        setConnectAllowed(false);
        setConnectionStatus("verification_pending");
        return;
      }
      setConnectionStatus("disconnected");

    } catch (err) {
      const e = err as Error & { code?: string; status?: number };
      if (isCalendarUnavailableError(e)) {
        applyUnavailable();
        return;
      }
      // Never fake Connected from the application session.
      setConnectionStatus("disconnected");
      setGoogleEmail(null);
    } finally {
      setIsCheckingConnection(false);
    }
  }, [user, applyUnavailable]);

  const probeSyncAvailability = useCallback(async (): Promise<void> => {
    if (!user?.id) {
      setIsProbingSync(false);
      return;
    }
    setIsProbingSync(true);
    try {
      const result = await probeSyncAvailabilityCached(true, () =>
        fetchEdgeJson("sync-calendar", { probe: true }, { timeoutMs: CALENDAR_PROBE_TIMEOUT_MS }),
      );
      if (!result.inconclusive) {
        setSyncAvailable(result.available);
        setConnectAllowed(result.connectAllowed);
        if (result.unavailable) {
          setConnectionStatus("not_configured");
          setError(CALENDAR_UNAVAILABLE_MSG);
        } else if (result.available && !result.connectAllowed) {
          applyVerificationPending();
        }
      }
    } finally {
      setIsProbingSync(false);
    }
  }, [user?.id, applyVerificationPending]);

  useEffect(() => {
    if (!user?.id) {
      setIsCheckingConnection(false);
      setIsProbingSync(false);
      return;
    }
    checkConnection();
    void probeSyncAvailability();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "SIGNED_OUT") {
          clearSyncProbeCache();
          setSyncAvailable(false);
          setConnectAllowed(false);
          setConnectionStatus("disconnected");
        }
        if (CONNECTION_CHECK_EVENTS.includes(event)) {
          if (event === "SIGNED_IN") clearSyncProbeCache();
          checkConnection();
          void probeSyncAvailability();
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [user?.id, checkConnection, probeSyncAvailability]);

  const connectGoogle = useCallback(async (): Promise<{ error: string | null }> => {
    if (!syncAvailable) {
      const msg = CALENDAR_UNAVAILABLE_MSG;
      setError(msg);
      setConnectionStatus("not_configured");
      return { error: msg };
    }
    if (!connectAllowed) {
      const msg = CALENDAR_VERIFICATION_PENDING_MSG;
      applyVerificationPending();
      setError(msg);
      return { error: msg };
    }
    if (connectingRef.current && connectInflight) return connectInflight;
    connectingRef.current = true;
    setIsConnecting(true);
    setError(null);

    connectInflight = (async () => {
      try {
        const data = await fetchEdgeJson<{
          authorization_url?: string;
          already_connected?: boolean;
          connected?: boolean;
          error?: string;
          code?: string;
        }>("sync-calendar", { action: "oauth_start" });

        if (data?.already_connected || data?.connected) {
          setConnectionStatus("connected");
          return { error: null };
        }

        const url = data?.authorization_url;
        if (!url || !url.startsWith("https://accounts.google.com/")) {
          const msg = "Could not start Google Calendar authorization.";
          setError(msg);
          return { error: msg };
        }

        window.location.assign(url);
        return { error: null };
      } catch (err) {
        const e = err as Error & { code?: string; status?: number };
        if (isCalendarUnavailableError(e)) {
          applyUnavailable();
          return { error: CALENDAR_UNAVAILABLE_MSG };
        }
        if (isCalendarOauthNotPublicError(e)) {
          applyVerificationPending();
          setError(CALENDAR_VERIFICATION_PENDING_MSG);
          return { error: CALENDAR_VERIFICATION_PENDING_MSG };
        }
        const msg = err instanceof Error ? err.message : "Failed to connect Google Calendar";
        setError(msg);
        return { error: msg };
      } finally {
        connectingRef.current = false;
        connectInflight = null;
        setIsConnecting(false);
      }
    })();

    return connectInflight;
  }, [syncAvailable, connectAllowed, applyUnavailable, applyVerificationPending]);

  const completeOAuthCallback = useCallback(async (input: {
    code?: string | null;
    state?: string | null;
    error?: string | null;
    errorDescription?: string | null;
  }): Promise<{ connected: boolean; error: string | null; code?: string }> => {
    try {
      const data = await fetchEdgeJson<{
        connected?: boolean;
        already_connected?: boolean;
        error?: string;
        code?: string;
      }>("sync-calendar", {
        action: "oauth_callback",
        code: input.code ?? undefined,
        state: input.state ?? undefined,
        error: input.error ?? undefined,
        error_description: input.errorDescription ?? undefined,
      });
      if (data?.connected) {
        setConnectionStatus("connected");
        setError(null);
        return { connected: true, error: null };
      }
      const msg = data?.error ?? "Google Calendar authorization did not complete.";
      setConnectionStatus("disconnected");
      setError(msg);
      return { connected: false, error: msg, code: data?.code };
    } catch (err) {
      const e = err as Error & { code?: string; status?: number };
      if (isCalendarUnavailableError(e)) {
        applyUnavailable();
        return { connected: false, error: CALENDAR_UNAVAILABLE_MSG, code: "NOT_CONFIGURED" };
      }
      const msg = err instanceof Error ? err.message : "Google Calendar authorization failed.";
      setConnectionStatus(e.code === "REAUTH_REQUIRED" ? "reauth_required" : "disconnected");
      setError(msg);
      return { connected: false, error: msg, code: e.code };
    }
  }, [applyUnavailable]);

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
      const res = await fetchEdge("sync-calendar", {});
      const data = await parseEdgeJson<{
        imported?: number;
        error?: string;
        code?: string;
      }>(res);

      if (data?.code === "REAUTH_REQUIRED" || data?.code === "TOKEN_REVOKED") {
        setConnectionStatus("reauth_required");
        const msg = "Google Calendar permission was revoked. Please reconnect.";
        setError(msg);
        return { imported: 0, error: msg };
      }

      if (data?.code === "CALENDAR_NOT_CONNECTED" || data?.code === "NO_TOKEN") {
        setConnectionStatus("disconnected");
        const msg = "Google Calendar is not connected.";
        setError(msg);
        return { imported: 0, error: msg };
      }

      if (data?.error) throw new Error(data.error);

      const count = data?.imported ?? 0;
      setLastSynced(new Date());
      setImportedCount(count);
      setConnectionStatus("connected");
      return { imported: count, error: null };
    } catch (err) {
      const e = err as Error & { code?: string; status?: number };
      if (e.code === "REAUTH_REQUIRED" || e.code === "TOKEN_REVOKED") {
        setConnectionStatus("reauth_required");
        const msg = "Google Calendar permission was revoked. Please reconnect.";
        setError(msg);
        return { imported: 0, error: msg };
      }
      if (e.code === "CALENDAR_NOT_CONNECTED" || e.code === "NO_TOKEN") {
        setConnectionStatus("disconnected");
        const msg = "Google Calendar is not connected.";
        setError(msg);
        return { imported: 0, error: msg };
      }
      if (isCalendarUnavailableError(e)) {
        applyUnavailable();
        return { imported: 0, error: CALENDAR_UNAVAILABLE_MSG };
      }
      const msg = err instanceof Error ? err.message : "Sync failed";
      setError(msg);
      return { imported: 0, error: msg };
    } finally {
      setIsSyncing(false);
    }
  }, [user, syncAvailable, applyUnavailable]);

  const disconnect = useCallback(async (): Promise<{ error: string | null }> => {
    if (!user) return { error: "Not authenticated" };
    setIsDisconnecting(true);
    setError(null);

    try {
      const data = await fetchEdgeJson<{ success?: boolean; error?: string }>(
        "disconnect-calendar",
        undefined,
        { method: "POST" },
      );

      if (data?.success === false) {
        const msg = data?.error ?? "Failed to disconnect Google Calendar";
        setError(msg);
        return { error: msg };
      }

      setConnectionStatus("disconnected");
      setGoogleEmail(null);
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

  const writeEvent = useCallback(async (input: {
    interviewId: string;
    summary: string;
    description?: string;
    startIso: string;
    endIso: string;
    timeZone?: string;
    location?: string;
    eventId?: string;
  }): Promise<WriteResult> => {
    if (!syncAvailable) {
      return { eventId: null, error: CALENDAR_UNAVAILABLE_MSG, code: "NOT_CONFIGURED" };
    }
    if (connectionStatus === "disconnected") {
      return {
        eventId: null,
        error: "Google Calendar is not connected.",
        code: "CALENDAR_NOT_CONNECTED",
      };
    }
    const key = input.interviewId;
    const existing = writeInflight.get(key);
    if (existing) return existing;

    const pending = (async (): Promise<WriteResult> => {
      try {
        const data = await fetchEdgeJson<{ event_id?: string; error?: string; code?: string }>(
          "sync-calendar",
          {
            action: "write_event",
            interview_id: input.interviewId,
            summary: input.summary,
            description: input.description,
            start: input.startIso,
            end: input.endIso,
            time_zone: input.timeZone,
            location: input.location,
            event_id: input.eventId,
          },
        );
        if (data?.error) return { eventId: null, error: data.error, code: data.code };
        if (!data?.event_id) {
          return { eventId: null, error: "Calendar event was not created.", code: "SYNC_ERROR" };
        }
        return { eventId: data.event_id, error: null };
      } catch (err) {
        const e = err as Error & { code?: string; status?: number };
        if (e.code === "REAUTH_REQUIRED") {
          setConnectionStatus("reauth_required");
        }
        if (e.code === "CALENDAR_NOT_CONNECTED") {
          setConnectionStatus("disconnected");
        }
        if (isCalendarUnavailableError(e)) {
          applyUnavailable();
          return { eventId: null, error: CALENDAR_UNAVAILABLE_MSG, code: "NOT_CONFIGURED" };
        }
        return {
          eventId: null,
          error: err instanceof Error ? err.message : "Calendar write failed",
          code: e.code,
        };
      } finally {
        writeInflight.delete(key);
      }
    })();

    writeInflight.set(key, pending);
    return pending;
  }, [syncAvailable, connectionStatus, applyUnavailable]);

  const deleteEvent = useCallback(async (input: {
    interviewId: string;
    eventId?: string;
  }): Promise<DeleteResult> => {
    if (!syncAvailable) {
      return { error: null, code: "NOT_CONFIGURED" };
    }
    const key = input.interviewId;
    const existing = deleteInflight.get(key);
    if (existing) return existing;

    const pending = (async (): Promise<DeleteResult> => {
      try {
        await fetchEdgeJson("sync-calendar", {
          action: "delete_event",
          interview_id: input.interviewId,
          event_id: input.eventId,
        });
        return { error: null };
      } catch (err) {
        const e = err as Error & { code?: string; status?: number };
        if (e.code === "REAUTH_REQUIRED") {
          setConnectionStatus("reauth_required");
        }
        if (isCalendarUnavailableError(e)) {
          return { error: null, code: "NOT_CONFIGURED" };
        }
        return {
          error: err instanceof Error ? err.message : "Calendar cancel failed",
          code: e.code,
        };
      } finally {
        deleteInflight.delete(key);
      }
    })();

    deleteInflight.set(key, pending);
    return pending;
  }, [syncAvailable]);

  return {
    connectGoogle,
    completeOAuthCallback,
    syncNow,
    writeEvent,
    deleteEvent,
    disconnect,
    checkConnection,
    probeSyncAvailability,
    isSyncing,
    isDisconnecting,
    isConnecting,
    isCheckingConnection,
    isProbingSync,
    isConnected,
    reauthRequired,
    verificationPending,
    connectionStatus,
    googleEmail,
    syncAvailable,
    connectAllowed,
    lastSynced,
    importedCount,
    error,
  };
}
