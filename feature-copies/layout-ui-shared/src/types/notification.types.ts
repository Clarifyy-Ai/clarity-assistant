// Notification types - re-export from user.types
export type { NotificationType, AppNotification } from "@/types/user.types";

export interface NotificationChannel {
  id: string;
  label: string;
  enabled: boolean;
}
