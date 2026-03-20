import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { AppNotification } from "@/types/user.types";
import { useAuthStore as _useAuthStore } from "./authStore";
import type { ProfileRow, SupabaseUser, SupabaseSession } from "@/types";

// ─────────────────────────────────────────────────────────────────
// Auth Store — compatibility wrapper around the primary authStore.
//
// All 50+ components that import useAuthStore from this file now
// read from the single source of truth (authStore.ts), which is
// properly initialised by App.tsx via authStore.initialize().
//
// Added shims:
//   isLoading        – computed from status
//   isAuthenticated  – computed from status
//   clearAuth        – alias for signOut
//   setProfile       – direct state patch (local-only)
//   setUser          – direct state patch (local-only)
//   setSession       – delegates to authStore.setSession
//   setIsLoading     – no-op (status is source of truth)
//   updateProfile    – local-only patch (useAuth.ts owns the DB write)
// ─────────────────────────────────────────────────────────────────

export function useAuthStore() {
  const state = _useAuthStore();

  return {
    ...state,

    // Computed
    isLoading:       state.status === "idle" || state.status === "loading",
    isAuthenticated: state.status === "authenticated",

    // Compatibility aliases / shims
    clearAuth:   state.signOut,
    setSession:  state.setSession,
    setIsLoading: (_loading: boolean) => { /* status-driven, no-op */ },

    setProfile: (profile: ProfileRow | null) =>
      _useAuthStore.setState({ profile } as any),

    setUser: (user: SupabaseUser | null) =>
      _useAuthStore.setState({ user } as any),

    // Local-only patch so useAuth.ts can update profile state after
    // its own DB write without triggering a second DB call.
    updateProfile: (patch: Partial<ProfileRow>) =>
      _useAuthStore.setState((s) => ({
        profile: s.profile ? ({ ...s.profile, ...patch } as ProfileRow) : null,
      })),
  };
}

// Expose getState for non-hook call-sites (e.g. useAuth.ts)
(useAuthStore as any).getState = () => {
  const s = _useAuthStore.getState();
  return {
    ...s,
    isLoading:       s.status === "idle" || s.status === "loading",
    isAuthenticated: s.status === "authenticated",
  };
};

// ─────────────────────────────────────────────────────────────────
// Notification Store
// ─────────────────────────────────────────────────────────────────

interface NotificationSlice {
  notifications: AppNotification[];
  unread_count: number;
  is_loading: boolean;

  setNotifications: (notifications: AppNotification[]) => void;
  addNotification: (notification: AppNotification) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  setUnreadCount: (count: number) => void;
  setIsLoading: (loading: boolean) => void;
}

export const useNotificationStore = create<NotificationSlice>()(
  subscribeWithSelector((set) => ({
    notifications: [],
    unread_count: 0,
    is_loading: false,

    setNotifications: (notifications) =>
      set({
        notifications,
        unread_count: notifications.filter((n) => !n.is_read).length,
      }),

    addNotification: (notification) =>
      set((state) => ({
        notifications: [notification, ...state.notifications],
        unread_count: state.unread_count + (notification.is_read ? 0 : 1),
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
        unread_count: 0,
      })),

    removeNotification: (id) =>
      set((state) => {
        const removed = state.notifications.find((n) => n.id === id);
        return {
          notifications: state.notifications.filter((n) => n.id !== id),
          unread_count: removed && !removed.is_read
            ? Math.max(0, state.unread_count - 1)
            : state.unread_count,
        };
      }),

    setUnreadCount: (count) => set({ unread_count: count }),
    setIsLoading: (is_loading) => set({ is_loading }),
  }))
);
