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
import { Search, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { EmptyState } from "@/components/common/EmptyState";
import { toAdminUserMessage } from "@/lib/admin/adminErrors";

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

export default function AdminAuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [actionQuery, setActionQuery] = useState("");
  const [actionPreset, setActionPreset] = useState<string>("all");
  const [targetType, setTargetType] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        let q = (supabase as any)
          .from("admin_audit_log")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

        const actionFilter = actionPreset !== "all" ? actionPreset : actionQuery.trim();
        if (actionFilter) q = q.ilike("action", `%${actionFilter}%`);
        if (targetType !== "all") q = q.eq("target_type", targetType);
        if (from) q = q.gte("created_at", new Date(from).toISOString());
        if (to) q = q.lte("created_at", new Date(`${to}T23:59:59`).toISOString());

        const { data, count, error } = await q;
        if (cancelled) return;
        if (error) throw error;
        setRows((data ?? []) as AuditRow[]);
        setTotal(count ?? 0);
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
  }, [page, actionQuery, actionPreset, targetType, from, to]);

  const resetFilters = () => {
    setActionQuery("");
    setActionPreset("all");
    setTargetType("all");
    setFrom("");
    setTo("");
    setPage(0);
  };

  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Admin Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Privileged actions performed by administrators.
          </p>
        </div>
        <Badge variant="red" size="sm">{total.toLocaleString()} events</Badge>
      </div>

      {loadError && (
        <InlineErrorRetry
          message={loadError}
          onRetry={() => {
            setPage(0);
            setLoadError(null);
          }}
        />
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Target types and actions are fixed enums, not page-local.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search action…"
              value={actionQuery}
              onChange={(e) => { setActionQuery(e.target.value); setActionPreset("all"); setPage(0); }}
            />
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
          <Input type="date" className="w-[150px]" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
          <Input type="date" className="w-[150px]" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
          <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <EmptyState title="No audit events" description="No rows match these filters." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <Fragment key={r.id}>
                    <TableRow className="cursor-pointer" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {format(new Date(r.created_at), "yyyy-MM-dd HH:mm")}
                      </TableCell>
                      <TableCell><Badge variant="secondary">{r.action}</Badge></TableCell>
                      <TableCell className="text-xs">
                        {r.target_type ?? "—"}{r.target_id ? ` · ${r.target_id.slice(0, 8)}…` : ""}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.admin_id.slice(0, 8)}…</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {expanded === r.id ? "Hide" : "Details"}
                      </TableCell>
                    </TableRow>
                    {expanded === r.id && (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <pre className="max-h-48 overflow-auto rounded bg-muted/40 p-3 text-[11px]">
                            {JSON.stringify({ old: r.old_value, new: r.new_value, ip: r.ip_address }, null, 2)}
                          </pre>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="mt-4 flex items-center justify-between">
            <Button type="button" variant="outline" size="sm" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <span className="text-xs text-muted-foreground">Page {page + 1} / {maxPage + 1}</span>
            <Button type="button" variant="outline" size="sm" disabled={page >= maxPage} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
