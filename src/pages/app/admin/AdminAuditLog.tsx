import { useEffect, useMemo, useState } from "react";
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

export default function AdminAuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filters
  const [actionQuery, setActionQuery] = useState("");
  const [targetType, setTargetType] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        let q = (supabase as any)
          .from("admin_audit_log")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

        if (actionQuery.trim()) q = q.ilike("action", `%${actionQuery.trim()}%`);
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
          toast.error(err instanceof Error ? err.message : "Failed to load audit log");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [page, actionQuery, targetType, from, to]);

  const targetTypes = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.target_type && set.add(r.target_type));
    return Array.from(set).sort();
  }, [rows]);

  const resetFilters = () => {
    setActionQuery(""); setTargetType("all"); setFrom(""); setTo(""); setPage(0);
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

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by action…"
            value={actionQuery}
            onChange={(e) => { setActionQuery(e.target.value); setPage(0); }}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <Select value={targetType} onValueChange={(v) => { setTargetType(v); setPage(0); }}>
          <SelectTrigger className="w-[160px] h-8 text-sm">
            <SelectValue placeholder="Target type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All targets</SelectItem>
            {targetTypes.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date" value={from}
          onChange={(e) => { setFrom(e.target.value); setPage(0); }}
          className="h-8 text-sm w-[150px]"
        />
        <Input
          type="date" value={to}
          onChange={(e) => { setTo(e.target.value); setPage(0); }}
          className="h-8 text-sm w-[150px]"
        />

        <Button variant="ghost" size="sm" onClick={resetFilters}>
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
        </Button>
      </div>

      <Card padding="none">
        <CardHeader className="px-5 pt-4">
          <CardTitle>Events</CardTitle>
          <CardDescription>
            Page {page + 1} of {maxPage + 1} · {rows.length} on this page
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="text-right">Diff</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No events match your filters.</TableCell></TableRow>
              ) : (
                rows.map((r) => {
                  const isOpen = expanded === r.id;
                  return (
                    <>
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => setExpanded(isOpen ? null : r.id)}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(r.created_at), "MMM d, HH:mm:ss")}
                        </TableCell>
                        <TableCell><code className="text-xs font-mono">{r.action}</code></TableCell>
                        <TableCell className="text-xs">
                          {r.target_type ? <Badge variant="default" size="sm">{r.target_type}</Badge> : <span className="text-muted-foreground">—</span>}
                          {r.target_id && <span className="ml-2 font-mono text-muted-foreground">{r.target_id.slice(0, 8)}</span>}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.admin_id?.slice(0, 8) ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.ip_address ?? "—"}</TableCell>
                        <TableCell className="text-right text-xs text-primary">{isOpen ? "Hide" : "View"}</TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow key={`${r.id}-d`}>
                          <TableCell colSpan={6} className="bg-muted/30">
                            <div className="grid grid-cols-2 gap-4 p-2 text-xs">
                              <div>
                                <p className="font-semibold mb-1 text-muted-foreground">Old value</p>
                                <pre className="bg-background border border-border rounded p-2 overflow-auto max-h-60">{JSON.stringify(r.old_value, null, 2)}</pre>
                              </div>
                              <div>
                                <p className="font-semibold mb-1 text-muted-foreground">New value</p>
                                <pre className="bg-background border border-border rounded p-2 overflow-auto max-h-60">{JSON.stringify(r.new_value, null, 2)}</pre>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Showing {rows.length ? page * PAGE_SIZE + 1 : 0}–{page * PAGE_SIZE + rows.length} of {total}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Prev
          </Button>
          <Button variant="ghost" size="sm" disabled={page >= maxPage} onClick={() => setPage((p) => Math.min(maxPage, p + 1))}>
            Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
