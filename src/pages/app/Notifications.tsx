import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/userStore";
import { notificationsDB } from "@/lib/supabase/database";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { Bell, Check, CheckCheck, CreditCard, AlertTriangle, Info, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase";

type Notification = Tables<"notifications">;

const TYPE_ICONS: Record<string, React.ElementType> = {
  credit: CreditCard,
  alert: AlertTriangle,
  info: Info,
  session: Bell,
};

export default function Notifications() {
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await notificationsDB.listByUserId(user.id);
      setNotifications(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load notifications");
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev].slice(0, 50));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) =>
            prev.map((n) => (n.id === (payload.new as Notification).id ? (payload.new as Notification) : n))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => prev.filter((n) => n.id !== (payload.old as Notification).id));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  async function markRead(id: string) {
    try {
      await notificationsDB.markRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark as read");
    }
  }

  async function markAllRead() {
    if (!user?.id) return;
    try {
      await notificationsDB.markAllRead(user.id);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast.success("All notifications marked as read");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark notifications as read.");
    }
  }

  async function deleteNotification(id: string) {
    try {
      await notificationsDB.delete(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete notification.");
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        actions={
          unreadCount > 0 ? (
            <Button variant="secondary" size="sm" onClick={markAllRead} leftIcon={<CheckCheck className="w-4 h-4" />}>
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {loadError && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-3">
          <span className="flex-1">{loadError}</span>
          <Button size="sm" variant="outline" onClick={() => void loadNotifications()}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse h-20" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <Card className="text-center py-12">
          <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-foreground font-medium">No notifications yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            You'll see session reminders, credit alerts, and updates here.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const Icon = TYPE_ICONS[n.type ?? ""] ?? Bell;
            return (
              <Card
                key={n.id}
                className={cn(!n.is_read && "border-violet-500/30")}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "mt-0.5 p-2 rounded-lg flex-shrink-0",
                    n.is_read ? "bg-muted" : "bg-violet-500/15"
                  )}>
                    <Icon className={cn("w-4 h-4", n.is_read ? "text-muted-foreground" : "text-violet-500")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium", n.is_read ? "text-muted-foreground" : "text-foreground")}>
                      {n.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(n.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {!n.is_read && (
                      <button onClick={() => markRead(n.id)} className="p-1.5 rounded-lg hover:bg-accent/10 text-muted-foreground hover:text-foreground" title="Mark as read">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => deleteNotification(n.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
