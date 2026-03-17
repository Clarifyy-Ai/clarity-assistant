import { useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useNotificationStore } from "@/store/notificationStore";
import { useAuthStore } from "@/store/userStore";
import type { AppNotification } from "@/types/notification.types";

// ─────────────────────────────────────────────────────────────────
// useNotifications
// Loads, marks-read, and listens for new notifications.
// Also handles push permission prompting.
// ─────────────────────────────────────────────────────────────────

export function useNotifications() {
  const { user }  = useAuthStore();
  const store     = useNotificationStore();

  // ── Load on mount ─────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    loadNotifications();
    const unsub = subscribeRealtime();
    return () => { unsub(); };
  }, [user?.id]);

  async function loadNotifications(): Promise<void> {
    store.setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) store.setNotifications(data as AppNotification[]);
    store.setLoading(false);
  }

  // ── Realtime subscription ─────────────────────────────────────

  function subscribeRealtime(): () => void {
    const channel = supabase
      .channel(`notifications:${user!.id}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "notifications",
          filter: `user_id=eq.${user!.id}`,
        },
        (payload) => {
          store.prependNotification(payload.new as AppNotification);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }

  // ── Mark single notification as read ─────────────────────────

  const markRead = useCallback(async (id: string): Promise<void> => {
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id);
    store.markRead(id);
  }, [store]);

  // ── Mark all as read ──────────────────────────────────────────

  const markAllRead = useCallback(async (): Promise<void> => {
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", user!.id)
      .eq("is_read", false);
    store.markAllRead();
  }, [user, store]);

  // ── Request push permission ───────────────────────────────────

  const requestPushPermission = useCallback(async (): Promise<boolean> => {
    if (!("Notification" in window)) return false;
    const result = await Notification.requestPermission();
    store.setPushPermission(result === "granted");
    return result === "granted";
  }, [store]);

  return {
    notifications:      store.notifications,
    unreadCount:        store.unreadCount,
    isLoading:          store.isLoading,
    pushPermission:     store.pushPermission,
    markRead,
    markAllRead,
    requestPushPermission,
    reload:             loadNotifications,
  };
}
