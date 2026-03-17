import { useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useNotificationStore } from "@/store/notificationStore";
import { useAuthStore } from "@/store/userStore";
import type { AppNotification } from "@/types/user.types";

export function useNotifications() {
  const { user }  = useAuthStore();
  const store     = useNotificationStore();

  useEffect(() => {
    if (!user) return;
    loadNotifications();
  }, [user?.id]);

  async function loadNotifications(): Promise<void> {
    store.setIsLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) store.setNotifications(data as AppNotification[]);
    store.setIsLoading(false);
  }

  const markRead = useCallback(async (id: string): Promise<void> => {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);
    store.markAsRead(id);
  }, [store]);

  const markAllRead = useCallback(async (): Promise<void> => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    store.markAllAsRead();
  }, [user, store]);

  const requestPushPermission = useCallback(async (): Promise<boolean> => {
    return store.requestPushPermission();
  }, [store]);

  return {
    notifications:      store.notifications,
    unreadCount:        store.unread_count,
    isLoading:          store.is_loading,
    pushPermission:     store.push_permission,
    markRead,
    markAllRead,
    requestPushPermission,
    reload:             loadNotifications,
  };
}
