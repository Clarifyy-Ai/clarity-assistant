import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import type { Session, User } from "@supabase/supabase-js";
import type { UserProfile, AppNotification } from "@/types/user.types";

// ─────────────────────────────────────────────────────────────────
// Auth Slice
// ─────────────────────────────────────────────────────────────────

interface AuthSlice {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  setSession: (session: Session | null) => void;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  setIsLoading: (loading: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthSlice>()(
  subscribeWithSelector((set) => ({
    session: null,
    user: null,
    profile: null,
    isLoading: true,
    isAuthenticated: false,

    setSession: (session) =>
      set({ session, isAuthenticated: !!session, isLoading: false }),

    setUser: (user) => set({ user }),

    setProfile: (profile) => set({ profile }),

    updateProfile: (patch) =>
      set((state) => ({
        profile: state.profile ? { ...state.profile, ...patch } : null,
      })),

    setIsLoading: (isLoading) => set({ isLoading }),

    clearAuth: () =>
      set({
        session: null,
        user: null,
        profile: null,
        isAuthenticated: false,
        isLoading: false,
      }),
  }))
);

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
