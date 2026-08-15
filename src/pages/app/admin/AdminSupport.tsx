import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, RotateCcw, MessageSquare, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

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
  closed: "default",
};

export default function AdminSupport() {
  const [rows, setRows] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

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
        if (search.trim()) q = q.ilike("subject", `%${search.trim()}%`);

        const { data, error } = await q;
        if (cancelled) return;
        if (error) throw error;
        setRows((data ?? []) as ThreadRow[]);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load support threads");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [search, status, priority, unreadOnly]);

  const resetFilters = () => {
    setSearch(""); setStatus("all"); setPriority("all"); setUnreadOnly(false);
  };

  const unreadCount = rows.filter((r) => r.unread_for_admin).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Support Threads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Read-only queue overview. Reply and resolve threads in Support messages.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="red" size="sm">{unreadCount} unread</Badge>
          <Badge variant="default" size="sm">{rows.length} threads</Badge>
          <Link to="/app/admin/live-chat">
            <Button size="sm" leftIcon={<ExternalLink className="h-3.5 w-3.5" />}>
              Open Support messages
            </Button>
          </Link>
        </div>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            This page lists threads only. Use{" "}
            <Link to="/app/admin/live-chat" className="text-primary font-medium underline-offset-2 hover:underline">
              Support messages
            </Link>{" "}
            to message users.
          </p>
          <Link to="/app/admin/live-chat">
            <Button variant="secondary" size="sm">Go to Support messages</Button>
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
            <SelectItem value="closed">Closed</SelectItem>
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
