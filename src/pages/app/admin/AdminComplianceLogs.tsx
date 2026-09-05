import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { profilesDB } from "@/lib/supabase/database";
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
import { Search, RotateCcw, ChevronLeft, ChevronRight, Shield, CheckCircle2, XCircle, UserX } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { EmptyState } from "@/components/common/EmptyState";
import { toAdminUserMessage } from "@/lib/admin/adminErrors";
import { AdminSectionDashboard } from "@/components/admin/AdminSectionDashboard";
import { AdminRecentActivityList } from "@/components/admin/AdminRecentActivityList";
import { fetchComplianceLogDashboardStats } from "@/lib/admin/sectionDashboardStats";
import { COMPLIANCE_QUICK_LINKS } from "@/lib/admin/adminSectionNav";

type ComplianceRow = {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  status: string;
  metadata: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

type ProfileLite = { id: string; full_name: string | null; email: string | null };

const PAGE_SIZE = 50;

export default function AdminComplianceLogs() {
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionQuery, setActionQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dashStats, setDashStats] = useState<Awaited<ReturnType<typeof fetchComplianceLogDashboardStats>> | null>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [recentFailures, setRecentFailures] = useState<Pick<ComplianceRow, "id" | "action" | "status" | "created_at">[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchComplianceLogDashboardStats()
      .then((stats) => { if (!cancelled) setDashStats(stats); })
      .catch(() => { if (!cancelled) setDashStats(null); })
      .finally(() => { if (!cancelled) setDashLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("audit_logs")
          .select("id, action, status, created_at")
          .in("status", ["failure", "blocked"])
          .order("created_at", { ascending: false })
          .limit(5);
        if (error) throw error;
        if (!cancelled) setRecentFailures((data ?? []) as typeof recentFailures);
      } catch {
        if (!cancelled) setRecentFailures([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        let q = (supabase as any)
          .from("audit_logs")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

        if (actionQuery.trim().length >= 2) q = q.ilike("action", `%${actionQuery.trim()}%`);
        if (statusFilter !== "all") q = q.eq("status", statusFilter);
        if (actorFilter === "anonymous") q = q.is("user_id", null);
        if (actorFilter === "authenticated") q = q.not("user_id", "is", null);
        if (from) q = q.gte("created_at", new Date(from).toISOString());
        if (to) q = q.lte("created_at", new Date(`${to}T23:59:59`).toISOString());

        const { data, count, error } = await q;
        if (error) throw error;
        if (cancelled) return;

        const nextRows = (data ?? []) as ComplianceRow[];
        setRows(nextRows);
        setTotal(count ?? 0);

        const userIds = [...new Set(nextRows.map((r) => r.user_id).filter(Boolean))] as string[];
        if (userIds.length > 0) {
          const profs = await profilesDB.listLiteByIds(userIds);
          const map: Record<string, ProfileLite> = {};
          for (const p of profs) map[p.id] = p;
          if (!cancelled) setProfiles(map);
        } else if (!cancelled) {
          setProfiles({});
        }
      } catch (err) {
        if (!cancelled) {
          const msg = toAdminUserMessage(err, undefined, "AdminComplianceLogs");
          setLoadError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [page, actionQuery, statusFilter, actorFilter, from, to]);

  function resetComplianceFilters() {
    setActionQuery("");
    setStatusFilter("all");
    setActorFilter("all");
    setFrom("");
    setTo("");
    setPage(0);
  }

  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  function actorLabel(userId: string | null): string {
    if (!userId) return "Anonymous / guest";
    const p = profiles[userId];
    if (p?.full_name || p?.email) return p.full_name ?? p.email ?? userId.slice(0, 8);
    return `${userId.slice(0, 8)}…`;
  }

  function statusVariant(status: string): "emerald" | "red" | "amber" {
    if (status === "success") return "emerald";
    if (status === "blocked") return "red";
    return "amber";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Compliance &amp; Security Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Auth, billing, AI, and privacy events from audit_logs (includes anonymous/guest actions).
          </p>
        </div>
        <Badge variant="blue" size="sm">{total.toLocaleString()} events</Badge>
      </div>

      <AdminSectionDashboard
        loading={dashLoading}
        columns={5}
        quickLinks={COMPLIANCE_QUICK_LINKS}
        activityTitle="Recent failures & blocks"
        activity={
          <AdminRecentActivityList
            emptyMessage="No recent failures or blocked events."
            items={recentFailures.map((row) => ({
              id: row.id,
              title: row.action,
              badge: row.status,
              badgeVariant: row.status === "blocked" ? "warning" : "danger",
              meta: format(new Date(row.created_at), "MMM d, HH:mm"),
              onClick: () => {
                setStatusFilter(row.status);
                setPage(0);
              },
            }))}
          />
        }
        stats={[
          {
            id: "total",
            label: "All events",
            value: (dashStats?.total ?? 0).toLocaleString(),
            icon: Shield,
            onClick: resetComplianceFilters,
            active: statusFilter === "all" && actorFilter === "all" && !actionQuery && !from && !to,
          },
          {
            id: "success",
            label: "Success",
            value: (dashStats?.success ?? 0).toLocaleString(),
            variant: "success",
            icon: CheckCircle2,
            onClick: () => { setStatusFilter("success"); setPage(0); },
            active: statusFilter === "success",
          },
          {
            id: "failure",
            label: "Failure",
            value: (dashStats?.failure ?? 0).toLocaleString(),
            variant: "danger",
            icon: XCircle,
            onClick: () => { setStatusFilter("failure"); setPage(0); },
            active: statusFilter === "failure",
          },
          {
            id: "blocked",
            label: "Blocked",
            value: (dashStats?.blocked ?? 0).toLocaleString(),
            variant: "warning",
            icon: Shield,
            onClick: () => { setStatusFilter("blocked"); setPage(0); },
            active: statusFilter === "blocked",
          },
          {
            id: "anonymous",
            label: "Anonymous",
            value: (dashStats?.anonymous ?? 0).toLocaleString(),
            description: "Guest / no user_id",
            icon: UserX,
            onClick: () => { setActorFilter("anonymous"); setPage(0); },
            active: actorFilter === "anonymous",
          },
        ]}
      />

      {loadError && (
        <InlineErrorRetry message={loadError} onRetry={() => setPage(0)} />
      )}

      <Card padding="sm">
        <CardHeader className="mb-2 flex flex-col items-start gap-0.5 pb-0">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription className="text-xs">
            Separate from Admin Audit Log (privileged admin mutations only).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search action (min 2 chars)…"
              value={actionQuery}
              onChange={(e) => { setActionQuery(e.target.value); setPage(0); }}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failure">Failure</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>
          <Select value={actorFilter} onValueChange={(v) => { setActorFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Actor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actors</SelectItem>
              <SelectItem value="anonymous">Anonymous only</SelectItem>
              <SelectItem value="authenticated">Signed-in only</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" className="w-[150px]" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} aria-label="From date" />
          <Input type="date" className="w-[150px]" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} aria-label="To date" />
          <Button type="button" variant="outline" size="sm" onClick={resetComplianceFilters}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
          </Button>
        </CardContent>
      </Card>

      <Card padding="sm">
        <CardContent className="pt-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <EmptyState icon={Shield} title="No compliance events" description="Try adjusting filters." compact />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <Fragment key={row.id}>
                      <TableRow className="cursor-pointer" onClick={() => setExpanded((id) => (id === row.id ? null : row.id))}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(row.created_at), "MMM d, yyyy HH:mm")}
                        </TableCell>
                        <TableCell><Badge variant="secondary" size="sm">{row.action}</Badge></TableCell>
                        <TableCell className="text-xs">
                          {row.resource_type ?? "—"}
                          {row.resource_id ? (
                            <span className="text-muted-foreground ml-1 font-mono text-[10px]">{row.resource_id.slice(0, 12)}…</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className={row.user_id ? "" : "text-amber-600 dark:text-amber-400"}>{actorLabel(row.user_id)}</span>
                        </TableCell>
                        <TableCell><Badge variant={statusVariant(row.status)} size="sm">{row.status}</Badge></TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{expanded === row.id ? "Hide" : "Show"}</TableCell>
                      </TableRow>
                      {expanded === row.id && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/20">
                            <div className="space-y-2 p-2 text-xs">
                              <p><span className="font-semibold">IP:</span> {row.ip_address ?? "—"}</p>
                              <p><span className="font-semibold">User agent:</span> {row.user_agent ?? "—"}</p>
                              <pre className="overflow-x-auto max-h-48 rounded-lg bg-background/60 p-2 text-[11px]">
                                {JSON.stringify(row.metadata ?? {}, null, 2)}
                              </pre>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {maxPage > 0 && (
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button type="button" variant="outline" size="sm" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">Page {page + 1} / {maxPage + 1}</span>
              <Button type="button" variant="outline" size="sm" disabled={page >= maxPage} onClick={() => setPage((p) => Math.min(maxPage, p + 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
