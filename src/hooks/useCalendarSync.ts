import { useCallback, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import type { AuthChangeEvent } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────
// useCalendarSync
// Connects Google Calendar and imports upcoming interview events.
// ─────────────────────────────────────────────────────────────────

async function parseInvokeError(
  fnError: { context?: Response; message?: string } | null,
  data: Record<string, unknown> | null
): Promise<{ code?: string; error?: string } | null> {
  if (data && typeof data === "object") return data as { code?: string; error?: string };

  try {
    const ctx = fnError?.context;
    if (ctx && typeof ctx.json === "function") {
      return await ctx.json();
    }
    if (typeof fnError?.message === "string") {
      return JSON.parse(fnError.message);
    }
  } catch {
    // ignore parse failures
  }
  return null;
}

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
      const { data, error: fnError } = await supabase.functions.invoke(
        "disconnect-calendar",
        { method: "GET" }
      );
      if (!fnError && data !== null) {
        setIsConnected(!!data?.connected);
      } else {
        const { data: sessionData } = await supabase.auth.getSession();
        setIsConnected(!!sessionData?.session?.provider_token);
      }
    } catch {
      const { data: sessionData } = await supabase.auth.getSession();
      setIsConnected(!!sessionData?.session?.provider_token);
    } finally {
      setIsCheckingConnection(false);
    }
  }, [user]);

  // ── Mount + auth state listener ───────────────────────────────
  useEffect(() => {
    checkConnection();

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
  const connectGoogle = useCallback(async (): Promise<void> => {
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes:      "https://www.googleapis.com/auth/calendar.readonly",
        redirectTo:  `${window.location.origin}/app/settings/integrations?calendar=connected`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (oauthError) setError(oauthError.message);
  }, []);

  // ── Sync calendar events ──────────────────────────────────────
  const syncNow = useCallback(async (): Promise<{
    imported: number;
    error: string | null;
  }> => {
    if (!user) return { imported: 0, error: "Not authenticated" };
    setIsSyncing(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const providerToken = sessionData?.session?.provider_token;

      const body: Record<string, unknown> = {};
      if (providerToken) body.provider_token = providerToken;

      const { data, error: fnError } = await supabase.functions.invoke(
        "sync-calendar",
        { body }
      );

      if (fnError) {
        const parsed = await parseInvokeError(fnError, data);
        const code = parsed?.code;

        if (code === "TOKEN_REVOKED" || code === "NO_TOKEN") {
          setIsConnected(false);
          const msg = code === "TOKEN_REVOKED"
            ? "Google Calendar permission was revoked. Please reconnect."
            : "Google Calendar not connected. Please connect it first.";
          setError(msg);
          return { imported: 0, error: msg };
        }

        const msg = parsed?.error ?? fnError.message ?? "Sync failed";
        setError(msg);
        return { imported: 0, error: msg };
      }

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
      const msg = err instanceof Error ? err.message : "Sync failed";
      setError(msg);
      return { imported: 0, error: msg };
    } finally {
      setIsSyncing(false);
    }
  }, [user]);

  // ── Disconnect Google Calendar ────────────────────────────────
  const disconnect = useCallback(async (): Promise<{ error: string | null }> => {
    if (!user) return { error: "Not authenticated" };
    setIsDisconnecting(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "disconnect-calendar",
        { method: "POST" }
      );

      if (fnError) {
        const parsed = await parseInvokeError(fnError, data);
        const msg = parsed?.error ?? fnError.message ?? "Failed to disconnect Google Calendar";
        setError(msg);
        return { error: msg };
      }

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
    isSyncing,
    isDisconnecting,
    isCheckingConnection,
    isConnected,
    lastSynced,
    importedCount,
    error,
  };
}
