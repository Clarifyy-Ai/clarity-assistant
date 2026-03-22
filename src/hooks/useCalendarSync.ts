// @ts-nocheck
import { useCallback, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";

// ─────────────────────────────────────────────────────────────────
// useCalendarSync
// Connects Google Calendar and imports upcoming interview events.
// ─────────────────────────────────────────────────────────────────

// Extract structured body from a Supabase FunctionsHttpError.
// When functions.invoke gets a non-2xx response it surfaces the error
// through fnError, but data may still carry the parsed response body.
async function parseInvokeError(
  fnError: any,
  data: any
): Promise<{ code?: string; error?: string } | null> {
  // data may contain the body if invoke still parsed it
  if (data && typeof data === "object") return data;

  // Try to parse from fnError.context (a Response object in some SDK versions)
  try {
    const ctx = fnError?.context;
    if (ctx && typeof ctx.json === "function") {
      return await ctx.json();
    }
    if (typeof fnError?.message === "string") {
      const parsed = JSON.parse(fnError.message);
      return parsed;
    }
  } catch {
    // ignore parse failures
  }
  return null;
}

export function useCalendarSync() {
  const { user }   = useAuthStore();
  const [isSyncing, setIsSyncing]             = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);
  const [lastSynced, setLastSynced]           = useState<Date | null>(null);
  const [importedCount, setImportedCount]     = useState<number | null>(null);
  const [error, setError]                     = useState<string | null>(null);
  const [isConnected, setIsConnected]         = useState(false);

  // Check real connection state from the server (whether a Google identity/
  // refresh token is linked). This is more reliable than checking
  // session.provider_token which is session-scoped and can be stale.
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
        // Fallback to session token check if edge call fails
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

  // Load server-truth on mount and on auth state changes
  useEffect(() => {
    checkConnection();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkConnection();
    });

    return () => subscription.unsubscribe();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start the Google OAuth flow with calendar.readonly scope
  const connectGoogle = useCallback(async (): Promise<void> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes:      "https://www.googleapis.com/auth/calendar.readonly",
        redirectTo:  `${window.location.origin}/app/settings/integrations?calendar=connected`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) setError(error.message);
  }, []);

  // Call the sync-calendar edge function to import interview events.
  // The session provider_token is passed if available, but is optional —
  // the edge function will attempt server-side refresh from stored identity
  // if the session token is missing or expired.
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
      if (providerToken) {
        body.provider_token = providerToken;
      }

      const { data, error: fnError } = await supabase.functions.invoke("sync-calendar", {
        body,
      });

      // Parse structured error from non-2xx responses
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

      if (data?.error) {
        throw new Error(data.error);
      }

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

  // Revoke the Google Calendar integration without signing the user out.
  // Calls the disconnect-calendar edge function which:
  //   1. Revokes the refresh token at Google's OAuth endpoint
  //   2. Unlinks the Google identity from the user's Supabase account
  // The user's Supabase session is preserved — they stay logged in.
  // Returns an error message if the server-side operation failed.
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

      // Server confirmed disconnect — update local state
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
