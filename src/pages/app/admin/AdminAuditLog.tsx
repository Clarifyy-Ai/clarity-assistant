import { Fragment, useEffect, useState } from "react";
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
import { Search, RotateCcw, ChevronLeft, ChevronRight, ScrollText, Calendar, Clock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { EmptyState } from "@/components/common/EmptyState";
import { toAdminUserMessage } from "@/lib/admin/adminErrors";
import { profilesDB } from "@/lib/supabase/database";
import { AdminSectionDashboard } from "@/components/admin/AdminSectionDashboard";
import { AdminRecentActivityList } from "@/components/admin/AdminRecentActivityList";
import { fetchAuditLogDashboardStats } from "@/lib/admin/sectionDashboardStats";
import { AUDIT_QUICK_LINKS } from "@/lib/admin/adminSectionNav";
import { daysAgoIsoDate, isLast7DaysRange, isTodayRange, todayIsoDate } from "@/lib/admin/dateFilters";

interface AuditRow {
  id: string;
  admin_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  old_value: unknown;
  new_value: unknown;
  ip_address: string | null;
  created_at: string;
}

const PAGE_SIZE = 50;
const SEARCH_MIN_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 350;

/** Deterministic filter values — not derived from the current page. */
const AUDIT_TARGET_TYPES = [
  "user",
  "feature_flag",
  "question",
  "promo_code",
  "billing_settings",
  "blog_post",
  "help_article",
  "learning_course",
  "community_post",
  "gov_exam",
  "gov_source",
  "gov_paper",
  "question_translation",
  "model_pricing",
] as const;

const AUDIT_ACTIONS = [
  "ban",
  "unban",
  "grant_pro",
  "add_credits",
  "make_admin",
  "demote_admin",
  "feature_flag_update",
  "publish",
  "unpublish",
  "verify",
  "reject",
  "update",
  "create",
  "delete",
] as const;

type AdminProfileLite = { id: string; full_name: string | null; email: string | null };

function formatAuditSummary(row: AuditRow): string {
  const parts: string[] = [];
  if (row.target_type) parts.push(`Target: ${row.target_type}`);
  if (row.target_id) parts.push(`ID: ${row.target_id.slice(0, 12)}…`);
  if (row.ip_address) parts.push(`IP: ${row.ip_address}`);
  const nv = row.new_value as Record<string, unknown> | null;
  if (nv && typeof nv === "object") {
    if (typeof nv.actorRole === "string") parts.push(`Role: ${nv.actorRole}`);
    if (typeof nv.reason === "string") parts.push(`Reason: ${nv.reason}`);
  }
  return parts.length ? parts.join(" · ") : "No summary metadata";
}

function isValidDateRange(from: string, to: string): boolean {
  if (!from || !to) return true;
  const fromMs = new Date(from).getTime();
  const toMs = new Date(`${to}T23:59:59`).getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return false;
  return fromMs <= toMs;
}

export default function AdminAuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [adminProfiles, setAdminProfiles] = useState<Record<string, AdminProfileLite>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [actionQuery, setActionQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [actionPreset, setActionPreset] = useState<string>("all");
  const [targetType, setTargetType] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);
  const [dashStats, setDashStats] = useState<{ total: number; today: number; last7d: number } | null>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [recentEvents, setRecentEvents] = useState<Pick<AuditRow, "id" | "action" | "target_type" | "created_at">[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchAuditLogDashboardStats()
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
          .from("admin_audit_log")
          .select("id, action, target_type, created_at")
          .order("created_at", { ascending: false })
          .limit(5);
        if (error) throw error;
        if (!cancelled) setRecentEvents((data ?? []) as typeof recentEvents);
      } catch {
        if (!cancelled) setRecentEvents([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(actionQuery.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [actionQuery]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isValidDateRange(from, to)) {
        setDateRangeError("From date must be on or before To date.");
        setLoading(false);
        setRows([]);
        setTotal(0);
        return;
      }
      setDateRangeError(null);

      setLoading(true);
      setLoadError(null);
      try {
        let q = (supabase as any)
          .from("admin_audit_log")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

        const actionFilter =
          actionPreset !== "all"
            ? actionPreset
            : debouncedQuery.length >= SEARCH_MIN_LENGTH
              ? debouncedQuery
              : "";
        if (actionFilter) q = q.ilike("action", `%${actionFilter}%`);
        if (targetType !== "all") q = q.eq("target_type", targetType);
        if (from) q = q.gte("created_at", new Date(from).toISOString());
        if (to) q = q.lte("created_at", new Date(`${to}T23:59:59`).toISOString());

        const { data, count, error } = await q;
        if (cancelled) return;
        if (error) throw error;
        setRows((data ?? []) as AuditRow[]);
        setTotal(count ?? 0);

        const adminIds = [...new Set(((data ?? []) as AuditRow[]).map((r) => r.admin_id).filter(Boolean))];
        if (adminIds.length > 0) {
          const profs = await profilesDB.listLiteByIds(adminIds);
          const map: Record<string, AdminProfileLite> = {};
          for (const p of profs) map[p.id] = p;
          if (!cancelled) setAdminProfiles(map);
        } else if (!cancelled) {
          setAdminProfiles({});
        }
      } catch (err) {
        if (!cancelled) {
          logger.error("admin.audit_log.load.failed", { error: err });
          const msg = toAdminUserMessage(err, undefined, "AdminAuditLog");
          setLoadError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [page, debouncedQuery, actionPreset, targetType, from, to]);

  const resetFilters = () => {
    setActionQuery("");
    setDebouncedQuery("");
    setActionPreset("all");
    setTargetType("all");
    setFrom("");
    setTo("");
    setDateRangeError(null);
    setPage(0);
  };

  const applyTodayFilter = () => {
    const today = todayIsoDate();
    setActionQuery("");
    setDebouncedQuery("");
    setActionPreset("all");
    setTargetType("all");
    setFrom(today);
    setTo(today);
    setDateRangeError(null);
    setPage(0);
  };

  const apply7dFilter = () => {
    setActionQuery("");
    setDebouncedQuery("");
    setActionPreset("all");
    setTargetType("all");
    setFrom(daysAgoIsoDate(7));
    setTo(todayIsoDate());
    setDateRangeError(null);
    setPage(0);
  };

  const hasActiveFilters =
    debouncedQuery.length >= SEARCH_MIN_LENGTH ||
    actionPreset !== "all" ||
    targetType !== "all" ||
    Boolean(from || to);

  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  function adminLabel(adminId: string | null | undefined): { primary: string; secondary?: string } {
    if (!adminId) return { primary: "—" };
    const p = adminProfiles[adminId];
    if (p?.full_name || p?.email) {
      return {
        primary: p.full_name ?? p.email ?? adminId.slice(0, 8),
        secondary: p.email && p.full_name ? p.email : undefined,
      };
    }
    return { primary: `${adminId.slice(0, 8)}…`, secondary: adminId };
  }

  return (
    <div data-testid="dd-layout-root" className="space-y-4">
      <div data-testid="audit-header" className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Admin Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Privileged actions performed by administrators.
          </p>
        </div>
        <Badge variant="red" size="sm">{total.toLocaleString()} events</Badge>
      </div>

      <AdminSectionDashboard
        loading={dashLoading}
        quickLinks={AUDIT_QUICK_LINKS}
        activityTitle="Latest admin actions"
        activity={
          <AdminRecentActivityList
            emptyMessage="No audit events yet."
            items={recentEvents.map((row) => ({
              id: row.id,
              title: row.action.replace(/_/g, " "),
              subtitle: row.target_type ?? undefined,
              meta: format(new Date(row.created_at), "MMM d, HH:mm"),
              onClick: () => setExpanded((prev) => (prev === row.id ? null : row.id)),
              badge: row.target_type ?? undefined,
            }))}
          />
        }
        stats={[
          {
            id: "total",
            label: "All time",
            value: (dashStats?.total ?? total).toLocaleString(),
            description: "Click to clear filters",
            icon: ScrollText,
            onClick: resetFilters,
            active: !hasActiveFilters,
          },
          {
            id: "today",
            label: "Today",
            value: (dashStats?.today ?? 0).toLocaleString(),
            description: "Filter to today (UTC)",
            icon: Calendar,
            onClick: applyTodayFilter,
            active: isTodayRange(from, to) && actionPreset === "all" && targetType === "all" && !debouncedQuery,
          },
          {
            id: "7d",
            label: "Last 7 days",
            value: (dashStats?.last7d ?? 0).toLocaleString(),
            description: "Filter to past week",
            icon: Clock,
            onClick: apply7dFilter,
            active: isLast7DaysRange(from, to) && actionPreset === "all" && targetType === "all" && !debouncedQuery,
          },
          {
            id: "filtered",
            label: "Filtered view",
            value: total.toLocaleString(),
            description: hasActiveFilters ? "Active filters applied" : "Apply filters below",
            icon: Search,
            active: hasActiveFilters,
          },
        ]}
      />

      {loadError && (
        <InlineErrorRetry
          message={loadError}
          onRetry={() => {
            setPage(0);
            setLoadError(null);
          }}
        />
      )}

      <div data-testid="audit-filters">
      <Card padding="sm">
        <CardHeader className="mb-2 flex flex-col items-start gap-0.5 pb-0">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription className="text-xs">
            Search needs ≥{SEARCH_MIN_LENGTH} characters. Date range must be valid.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search action (min 2 chars)…"
              value={actionQuery}
              onChange={(e) => { setActionQuery(e.target.value); setActionPreset("all"); setPage(0); }}
              aria-describedby="audit-search-hint"
            />
            <p id="audit-search-hint" className="sr-only">
              Enter at least two characters to search. Search runs after a short pause.
            </p>
          </div>
          <Select value={actionPreset} onValueChange={(v) => { setActionPreset(v); setActionQuery(""); setPage(0); }}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {AUDIT_ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={targetType} onValueChange={(v) => { setTargetType(v); setPage(0); }}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Target type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All targets</SelectItem>
              {AUDIT_TARGET_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            className="w-[150px]"
            value={from}
            max={to || undefined}
            onChange={(e) => { setFrom(e.target.value); setPage(0); }}
            aria-label="From date"
          />
          <Input
            type="date"
            className="w-[150px]"
            value={to}
            min={from || undefined}
            onChange={(e) => { setTo(e.target.value); setPage(0); }}
            aria-label="To date"
          />
          <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
          </Button>
          {dateRangeError && (
            <p className="w-full text-xs text-red-400" role="alert">{dateRangeError}</p>
          )}
        </CardContent>
      </Card>
      </div>

      <div data-testid="audit-table-card">
      <Card padding="sm">
        <CardContent className="pt-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No audit events"
              description="Try adjusting filters or clearing the date range."
              compact
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <Fragment key={row.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setExpanded((id) => (id === row.id ? null : row.id))}
                      >
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(row.created_at), "MMM d, yyyy HH:mm")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" size="sm">{row.action}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.target_type ?? "—"}
                          {row.target_id ? (
                            <span className="text-muted-foreground ml-1 font-mono text-[10px]">
                              {row.target_id.slice(0, 8)}…
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium text-foreground">{adminLabel(row.admin_id).primary}</div>
                          {adminLabel(row.admin_id).secondary && (
                            <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                              {adminLabel(row.admin_id).secondary}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {expanded === row.id ? "Hide" : "Show"}
                        </TableCell>
                      </TableRow>
                      {expanded === row.id && (
                        <TableRow>
                          <TableCell colSpan={5} className="bg-muted/20">
                            <div className="space-y-2 p-2">
                              <p className="text-xs text-muted-foreground">{formatAuditSummary(row)}</p>
                              <div className="grid gap-2 md:grid-cols-2">
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Previous value</p>
                                  <pre className="text-[11px] overflow-x-auto max-h-40 rounded-lg bg-background/60 p-2">
                                    {JSON.stringify(row.old_value ?? null, null, 2)}
                                  </pre>
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">New value</p>
                                  <pre className="text-[11px] overflow-x-auto max-h-40 rounded-lg bg-background/60 p-2">
                                    {JSON.stringify(row.new_value ?? null, null, 2)}
                                  </pre>
                                </div>
                              </div>
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page + 1} / {maxPage + 1}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= maxPage}
                onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
