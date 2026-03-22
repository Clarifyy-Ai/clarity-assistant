// @ts-nocheck
import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";

// ─────────────────────────────────────────────────────────────────
// useCalendarSync
// Connects Google Calendar and imports upcoming interview events.
// ─────────────────────────────────────────────────────────────────

export function useCalendarSync() {
  const { user }   = useAuthStore();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [error, setError]          = useState<string | null>(null);

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

      if (!providerToken) {
        const msg = "Google Calendar not connected. Please connect it first.";
        setError(msg);
        return { imported: 0, error: msg };
      }

      const { data, error: fnError } = await supabase.functions.invoke("sync-calendar", {
        body: { provider_token: providerToken },
      });

      if (fnError) throw fnError;

      setLastSynced(new Date());
      return { imported: data?.imported ?? 0, error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      setError(msg);
      return { imported: 0, error: msg };
    } finally {
      setIsSyncing(false);
    }
  }, [user]);

  const disconnect = useCallback(async (): Promise<void> => {
    if (!user) return;
    await supabase.auth.signOut({ scope: "local" });
  }, [user]);

  return {
    connectGoogle,
    syncNow,
    disconnect,
    isSyncing,
    lastSynced,
    error,
  };
}
