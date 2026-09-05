import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { sanitizeAdminSearch } from "@/lib/admin/searchFilter";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, RotateCcw, MessageSquare, ExternalLink, Inbox, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AdminSectionDashboard } from "@/components/admin/AdminSectionDashboard";
import { AdminRecentActivityList } from "@/components/admin/AdminRecentActivityList";
import { fetchSupportDashboardStats } from "@/lib/admin/sectionDashboardStats";
import { SUPPORT_QUICK_LINKS } from "@/lib/admin/adminSectionNav";

interface ThreadRow {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  priority: string | null;
  assigned_admin_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_for_admin: boolean;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, "default" | "violet" | "red"> = {
  open: "violet",
  pending: "default",
  resolved: "default",
  snoozed: "default",
};

export default function AdminSupport() {
  const [rows, setRows] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [dashStats, setDashStats] = useState<Awaited<ReturnType<typeof fetchSupportDashboardStats>> | null>(null);
  const [dashLoading, setDashLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchSupportDashboardStats()
      .then((stats) => { if (!cancelled) setDashStats(stats); })
      .catch(() => { if (!cancelled) setDashStats(null); })
      .finally(() => { if (!cancelled) setDashLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(sanitizeAdminSearch(search)), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        let q = (supabase as any)
          .from("support_threads")
          .select("*")
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(200);

        if (status !== "all") q = q.eq("status", status);
        if (priority !== "all") q = q.eq("priority", priority);
        if (unreadOnly) q = q.eq("unread_for_admin", true);
        if (debouncedSearch) q = q.ilike("subject", `%${debouncedSearch}%`);

        const { data, error } = await q;
        if (cancelled) return;
        if (error) throw error;
        setRows((data ?? []) as ThreadRow[]);
      } catch (err) {
        if (!cancelled) {
          const { toAdminUserMessage } = await import("@/lib/admin/adminErrors");
          toast.error(toAdminUserMessage(err, undefined, "AdminSupport.load"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [debouncedSearch, status, priority, unreadOnly]);

  const resetFilters = () => {
    setSearch(""); setStatus("all"); setPriority("all"); setUnreadOnly(false);
  };

  const unreadCount = rows.filter((r) => r.unread_for_admin).length;

  const recentThreads = useMemo(
    () =>
      [...rows]
        .sort((a, b) => {
          const aTs = a.last_message_at ?? a.updated_at;
          const bTs = b.last_message_at ?? b.updated_at;
          return new Date(bTs).getTime() - new Date(aTs).getTime();
        })
        .slice(0, 5),
    [rows],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Support Threads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Read-only queue overview. Reply and resolve threads in Live Support.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="red" size="sm">{unreadCount} unread</Badge>
          <Badge variant="default" size="sm">{rows.length} threads</Badge>
          <Link
            to="/app/admin/live-chat"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-border bg-secondary hover:bg-secondary/80 text-secondary-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open Live Support
          </Link>
        </div>
      </div>

      <AdminSectionDashboard
        loading={dashLoading}
        columns={5}
        quickLinks={SUPPORT_QUICK_LINKS}
        activityTitle="Latest threads"
        activity={
          <AdminRecentActivityList
            emptyMessage="No threads match current filters."
            items={recentThreads.map((thread) => ({
              id: thread.id,
              title: thread.subject || "(no subject)",
              subtitle: thread.last_message_preview ?? undefined,
              badge: thread.unread_for_admin ? "Unread" : thread.status,
              badgeVariant: thread.unread_for_admin ? "danger" : thread.status === "open" ? "warning" : "default",
              meta: thread.last_message_at
                ? format(new Date(thread.last_message_at), "MMM d, HH:mm")
                : undefined,
              href: `/app/admin/live-chat?thread=${thread.id}`,
            }))}
          />
        }
        stats={[
          {
            id: "open",
            label: "Open",
            value: (dashStats?.open ?? 0).toLocaleString(),
            variant: "warning",
            icon: Inbox,
            onClick: () => { setStatus("open"); setUnreadOnly(false); setPriority("all"); },
            active: status === "open" && !unreadOnly && priority === "all",
          },
          {
            id: "pending",
            label: "Pending",
            value: (dashStats?.pending ?? 0).toLocaleString(),
            icon: Clock,
            onClick: () => { setStatus("pending"); setUnreadOnly(false); setPriority("all"); },
            active: status === "pending" && !unreadOnly,
          },
          {
            id: "resolved",
            label: "Resolved",
            value: (dashStats?.resolved ?? 0).toLocaleString(),
            variant: "success",
            icon: CheckCircle2,
            onClick: () => { setStatus("resolved"); setUnreadOnly(false); setPriority("all"); },
            active: status === "resolved" && !unreadOnly,
          },
          {
            id: "unread",
            label: "Unread",
            value: (dashStats?.unread ?? unreadCount).toLocaleString(),
            variant: "danger",
            icon: AlertCircle,
            onClick: () => { setUnreadOnly(true); setStatus("all"); setPriority("all"); },
            active: unreadOnly,
          },
          {
            id: "high",
            label: "High priority",
            value: (dashStats?.highPriority ?? 0).toLocaleString(),
            icon: MessageSquare,
            onClick: () => { setPriority("high"); setStatus("all"); setUnreadOnly(false); },
            active: priority === "high" && !unreadOnly,
          },
        ]}
      />

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            This page lists threads only. Use{" "}
            <Link to="/app/admin/live-chat" className="text-primary font-medium underline-offset-2 hover:underline">
              Live Support
            </Link>{" "}
            to message users.
          </p>
          <Link
            to="/app/admin/live-chat"
            className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-xl border border-border bg-transparent hover:bg-secondary text-foreground"
          >
            Go to Live Support
          </Link>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search subject…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox" checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="rounded border-border"
          />
          Unread only
        </label>

        <Button variant="ghost" size="sm" onClick={resetFilters}>
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
        </Button>
      </div>

      <Card padding="none">
        <CardHeader className="px-5 pt-4">
          <CardTitle>Threads</CardTitle>
          <CardDescription>Most recently active first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Last message</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No threads match your filters.</TableCell></TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <MessageSquare className={`h-3.5 w-3.5 ${r.unread_for_admin ? "text-red-500" : "text-muted-foreground/40"}`} />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground text-sm">{r.subject}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-md">{r.last_message_preview ?? "—"}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_COLORS[r.status] ?? "default"} size="sm">{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">{r.priority ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {r.last_message_at ? format(new Date(r.last_message_at), "MMM d, HH:mm") : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(r.updated_at), "MMM d, yyyy")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
