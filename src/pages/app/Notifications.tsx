import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/userStore";
import { useNavigate } from "react-router-dom";
import { notificationsDB } from "@/lib/supabase/database";
import { subscribeToNotificationFeed } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
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

/** Resolve a notification to an in-app URL based on type + entity id. */
function resolveNotificationUrl(n: Notification): string | null {
  const eid = (n as { entity_id?: string }).entity_id;
  const type = String(n.type);
  switch (type) {
    case "session":
      return eid ? `/app/sessions/${eid}` : "/app/sessions";
    case "debrief":
      return eid ? `/app/debriefs/${eid}` : "/app/debriefs";
    case "credit":
    case "billing":
      return "/app/settings/billing";
    case "alert":
    case "system":
      return "/app/usage";
    default:
      return null;
  }
}

export default function Notifications() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");

  const loadNotifications = useCallback(async (mode: "initial" | "background" = "initial") => {
    if (!user?.id) return;
    if (mode === "initial") {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const data = await notificationsDB.listByUserId(user.id);
      setNotifications(data);
    } catch {
      setLoadError("Couldn't load notifications. Please retry.");
      if (mode === "initial") setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!user?.id) return;
    return subscribeToNotificationFeed(user.id, {
      onInsert: (row) => {
        setNotifications((prev) => [row as Notification, ...prev].slice(0, 50));
      },
      onUpdate: (row) => {
        const next = row as Notification;
        setNotifications((prev) =>
          prev.map((n) => (n.id === next.id ? next : n)),
        );
      },
      onDelete: (oldRow) => {
        const id = (oldRow as { id?: string }).id;
        if (!id) return;
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      },
    });
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
  const filtered = notifications.filter((n) => {
    if (filter === "unread") return !n.is_read;
    if (filter === "read") return Boolean(n.is_read);
    return true;
  });

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
      <PageHeader
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        breadcrumbs={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Notifications" },
        ]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Filter notifications">
              {([
                { id: "all", label: "All" },
                { id: "unread", label: "Unread" },
                { id: "read", label: "Read" },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-md transition-colors",
                    filter === tab.id
                      ? "bg-primary/15 text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {unreadCount > 0 ? (
              <Button variant="secondary" size="sm" onClick={markAllRead} leftIcon={<CheckCheck className="w-4 h-4" />}>
                Mark all read
              </Button>
            ) : null}
          </div>
        }
      />

      {loadError && (
        <InlineErrorRetry message={loadError} onRetry={() => void loadNotifications()} className="mb-4" />
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            description="You'll see session reminders, credit alerts, and updates here. Manage email preferences in Settings → Notifications."
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bell}
            title={filter === "unread" ? "No unread notifications" : "No read notifications"}
            description="Try another filter, or update preferences in Settings → Notifications."
            actionLabel="Show all"
            onAction={() => setFilter("all")}
            compact
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => {
            const Icon = TYPE_ICONS[n.type ?? ""] ?? Bell;
            return (
              <Card
                key={n.id}
                className={cn(!n.is_read && "border-primary/30", resolveNotificationUrl(n) && "cursor-pointer")}
                onClick={() => {
                  const url = resolveNotificationUrl(n);
                  if (!n.is_read) markRead(n.id);
                  if (url) navigate(url);
                }}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "mt-0.5 p-2 rounded-lg flex-shrink-0",
                    n.is_read ? "bg-muted" : "bg-primary/15"
                  )}>
                    <Icon className={cn("w-4 h-4", n.is_read ? "text-muted-foreground" : "text-primary")} />
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
                      <button
                        onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
                        className="p-1.5 rounded-lg hover:bg-accent/10 text-muted-foreground hover:text-foreground"
                        aria-label="Mark as read"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
                      aria-label="Delete notification"
                    >
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
