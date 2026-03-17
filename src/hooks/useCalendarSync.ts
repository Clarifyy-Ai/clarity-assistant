import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import type { InterviewSchedule } from "@/types/interview.types";

// ─────────────────────────────────────────────────────────────────
// useCalendarSync
// Connects Google Calendar / Outlook and pulls interview events.
// ─────────────────────────────────────────────────────────────────

export function useCalendarSync() {
  const { user }   = useAuthStore();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [error, setError]          = useState<string | null>(null);

  // ── Initiate Google Calendar OAuth ───────────────────────────

  const connectGoogle = useCallback(async (): Promise<void> => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes:     "https://www.googleapis.com/auth/calendar.readonly",
        redirectTo: `${window.location.origin}/settings/integrations`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) setError(error.message);
  }, []);

  // ── Sync calendar via Edge Function ──────────────────────────

  const syncNow = useCallback(async (): Promise<{
    imported: number; error: string | null;
  }> => {
    if (!user) return { imported: 0, error: "Not authenticated" };
    setIsSyncing(true);
    setError(null);

    try {
      const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
      const res = await fetch(`${EDGE_BASE}/sync-calendar`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ user_id: user.id }),
      });

      if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
      const data = await res.json();
      setLastSynced(new Date());
      return { imported: data.imported ?? 0, error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      setError(msg);
      return { imported: 0, error: msg };
    } finally {
      setIsSyncing(false);
    }
  }, [user]);

  // ── Disconnect calendar ───────────────────────────────────────

  const disconnect = useCallback(async (): Promise<void> => {
    if (!user) return;
    await supabase
      .from("calendar_integrations")
      .delete()
      .eq("user_id", user.id);
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
