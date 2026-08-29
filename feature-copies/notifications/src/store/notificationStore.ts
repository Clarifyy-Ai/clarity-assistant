import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import type { AppNotification, NotificationType } from "@/types/user.types";

// ─────────────────────────────────────────────────────────────────
// Notification Preferences
// ─────────────────────────────────────────────────────────────────

export interface NotificationPreferences {
  // In-app
  streak_alerts: boolean;
  badge_unlocks: boolean;
  weekly_summary: boolean;
  interview_reminders: boolean;
  debrief_nudges: boolean;
  room_invitations: boolean;
  credit_low_alerts: boolean;

  // Push
  push_enabled: boolean;
  push_interview_reminders: boolean;
  push_debrief_nudges: boolean;

  // Email
  email_weekly_digest: boolean;
  email_interview_reminders: boolean;
  email_product_updates: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  streak_alerts: true,
  badge_unlocks: true,
  weekly_summary: true,
  interview_reminders: true,
  debrief_nudges: true,
  room_invitations: true,
  credit_low_alerts: true,
  push_enabled: false,
  push_interview_reminders: true,
  push_debrief_nudges: true,
  email_weekly_digest: true,
  email_interview_reminders: true,
  email_product_updates: false,
};

// ─────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────

interface NotificationStore {
  notifications: AppNotification[];
  unread_count: number;
  is_loading: boolean;
  push_permission: NotificationPermission | "unsupported";
  preferences: NotificationPreferences;

  // Notification CRUD
  setNotifications: (notifications: AppNotification[]) => void;
  addNotification: (notification: AppNotification) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;

  // Preference actions
  setPreference: <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K]
  ) => void;
  setAllPreferences: (prefs: NotificationPreferences) => void;

  // Push permission
  setPushPermission: (perm: NotificationPermission | "unsupported") => void;
  requestPushPermission: () => Promise<boolean>;

  // Helpers
  isEnabled: (type: NotificationType) => boolean;
  setIsLoading: (loading: boolean) => void;
}

const TYPE_TO_PREF_MAP: Partial<Record<NotificationType, keyof NotificationPreferences>> = {
  streak_alert:        "streak_alerts",
  badge_unlock:        "badge_unlocks",
  weekly_summary:      "weekly_summary",
  interview_reminder:  "interview_reminders",
  debrief_nudge:       "debrief_nudges",
  room_invitation:     "room_invitations",
  credit_low:          "credit_low_alerts",
};

export const useNotificationStore = create<NotificationStore>()(
  persist(
    subscribeWithSelector((set, get) => ({
      notifications: [],
      unread_count: 0,
      is_loading: false,
      push_permission: "default",
      preferences: DEFAULT_PREFERENCES,

      // ── Notification CRUD ──────────────────────────────
      setNotifications: (notifications) =>
        set({
          notifications,
          unread_count: notifications.filter((n) => !n.is_read).length,
        }),

      addNotification: (notification) =>
        set((s) => {
          // Check preference gate
          const prefKey = TYPE_TO_PREF_MAP[notification.type];
          if (prefKey && !s.preferences[prefKey]) return {};

          const notifications = [notification, ...s.notifications].slice(0, 100);
          return {
            notifications,
            unread_count: s.unread_count + (notification.is_read ? 0 : 1),
          };
        }),

      markAsRead: (id) =>
        set((s) => {
          const notification = s.notifications.find((n) => n.id === id);
          if (!notification || notification.is_read) return {};
          return {
            notifications: s.notifications.map((n) =>
              n.id === id ? { ...n, is_read: true } : n
            ),
            unread_count: Math.max(0, s.unread_count - 1),
          };
        }),

      markAllAsRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, is_read: true })),
          unread_count: 0,
        })),

      removeNotification: (id) =>
        set((s) => {
          const n = s.notifications.find((x) => x.id === id);
          return {
            notifications: s.notifications.filter((x) => x.id !== id),
            unread_count: n && !n.is_read
              ? Math.max(0, s.unread_count - 1)
              : s.unread_count,
          };
        }),

      clearAll: () => set({ notifications: [], unread_count: 0 }),

      // ── Preferences ────────────────────────────────────
      setPreference: (key, value) =>
        set((s) => ({
          preferences: { ...s.preferences, [key]: value },
        })),

      setAllPreferences: (preferences) => set({ preferences }),

      // ── Push permission ────────────────────────────────
      setPushPermission: (push_permission) => set({ push_permission }),

      requestPushPermission: async () => {
        if (!("Notification" in window)) {
          set({ push_permission: "unsupported" });
          return false;
        }
        try {
          const result = await Notification.requestPermission();
          set((s) => ({
            push_permission: result,
            preferences: {
              ...s.preferences,
              push_enabled: result === "granted",
            },
          }));
          return result === "granted";
        } catch {
          set({ push_permission: "denied" });
          return false;
        }
      },

      // ── Helper ─────────────────────────────────────────
      isEnabled: (type) => {
        const { preferences } = get();
        const key = TYPE_TO_PREF_MAP[type];
        if (!key) return true;
        return !!preferences[key];
      },

      setIsLoading: (is_loading) => set({ is_loading }),
    })),
    {
      name: "confideq-notifications",
      partialize: (s) => ({
        preferences: s.preferences,
        push_permission: s.push_permission,
      }),
    }
  )
);
