// ─────────────────────────────────────────────────────────────────────────────
// userStore.ts
//
// useAuthStore is now the single Zustand store defined in authStore.ts.
// All 50+ components that import from this file get the real, initialised
// auth state without any wrapper — eliminating the "Maximum update depth
// exceeded" infinite loop that was caused by returning a new object on every
// render.
// ─────────────────────────────────────────────────────────────────────────────

export { useAuthStore } from "./authStore";

// ─── Notification Store ───────────────────────────────────────────────────────

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { AppNotification } from "@/types/user.types";

interface NotificationSlice {
  notifications:  AppNotification[];
  unread_count:   number;
  is_loading:     boolean;

  setNotifications:   (notifications: AppNotification[]) => void;
  addNotification:    (notification: AppNotification) => void;
  markAsRead:         (id: string) => void;
  markAllAsRead:      () => void;
  removeNotification: (id: string) => void;
  setUnreadCount:     (count: number) => void;
  setIsLoading:       (loading: boolean) => void;
}

export const useNotificationStore = create<NotificationSlice>()(
  subscribeWithSelector((set) => ({
    notifications: [],
    unread_count:  0,
    is_loading:    false,

    setNotifications: (notifications) =>
      set({
        notifications,
        unread_count: notifications.filter((n) => !n.is_read).length,
      }),

    addNotification: (notification) =>
      set((state) => ({
        notifications: [notification, ...state.notifications],
        unread_count:  state.unread_count + (notification.is_read ? 0 : 1),
      })),

    markAsRead: (id) =>
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, is_read: true } : n
        ),
        unread_count: Math.max(
          0,
          state.notifications.filter((n) => !n.is_read && n.id !== id).length
        ),
      })),

    markAllAsRead: () =>
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
        unread_count:  0,
      })),

    removeNotification: (id) =>
      set((state) => {
        const removed = state.notifications.find((n) => n.id === id);
        return {
          notifications: state.notifications.filter((n) => n.id !== id),
          unread_count:  removed && !removed.is_read
            ? Math.max(0, state.unread_count - 1)
            : state.unread_count,
        };
      }),

    setUnreadCount: (count) => set({ unread_count: count }),
    setIsLoading:   (is_loading) => set({ is_loading }),
  }))
);
