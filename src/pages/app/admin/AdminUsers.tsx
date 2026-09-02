import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  DataTable,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/DataTable";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { writeAdminAudit } from "@/lib/admin/writeAdminAudit";
import { adminActionFailedMessage } from "@/lib/admin/adminErrors";
import { sanitizeAdminSearch } from "@/lib/admin/searchFilter";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { toast } from "sonner";
import { Search, Users, Shield, Zap, Ban, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
const PAGE_SIZE = 25;
interface UserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  plan_id: string | null;
  created_at: string;
  credits: number | null;
  is_admin: boolean;
  is_moderator: boolean;
  is_banned: boolean | null;
}
export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const requestSequence = useRef(0);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(sanitizeAdminSearch(search)), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    void fetchUsers();
    return () => {
      requestSequence.current += 1;
    };
  }, [page, debouncedSearch, filter]);
  async function fetchUsers() {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setFetchError(null);
    try {
      let q = supabase
        .from("profiles")
        .select("id, full_name, email, plan_id, created_at, credits, is_banned", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (debouncedSearch) {
        q = q.or(`full_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%`);
      }
      if (filter === "pro") {
        q = q.neq("plan_id", "free");
      }
      if (filter === "free") {
        q = q.eq("plan_id", "free");
      }
      const { data, count, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Omit<UserRow, "is_admin" | "is_moderator">[];
      const ids = rows.map((r) => r.id);
      let adminIds = new Set<string>();
      let moderatorIds = new Set<string>();
      if (ids.length > 0) {
        const { data: roles, error: roleErr } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("role", ["admin", "moderator"])
          .in("user_id", ids);
        if (roleErr) throw roleErr;
        for (const r of roles ?? []) {
          if (r.role === "admin") adminIds.add(r.user_id);
          if (r.role === "moderator") moderatorIds.add(r.user_id);
        }
      }
      if (requestId !== requestSequence.current) return;
      setUsers(rows.map((r) => ({
        ...r,
        is_admin: adminIds.has(r.id),
        is_moderator: moderatorIds.has(r.id),
      })));
      setTotal(count ?? 0);
    } catch (err) {
      const message = adminActionFailedMessage(err, "AdminUsers.load");
      if (requestId !== requestSequence.current) return;
      setFetchError(message);
      setUsers([]);
      setTotal(0);
      toast.error(message);
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }
  async function handleAction(action: string, userId: string) {
    setActionLoading(true);
    try {
      if (action === "make_admin") {
        const { error: roleErr } = await supabase
          .from("user_roles")
          .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
        if (roleErr) throw roleErr;
        await writeAdminAudit({
          action: "make_admin",
          targetType: "user",
          targetId: userId,
          newValue: { role: "admin" },
        });
        toast.success("User promoted to admin");
      } else if (action === "remove_admin") {
        if (!window.confirm("Remove admin role from this user?")) {
          setActionLoading(false);
          return;
        }
        const { error } = await supabase.rpc("demote_admin", { p_user_id: userId });
        if (error) throw error;
        toast.success("Admin role removed");
      } else if (action === "make_moderator") {
        const { error: roleErr } = await supabase
          .from("user_roles")
          .upsert({ user_id: userId, role: "moderator" }, { onConflict: "user_id,role" });
        if (roleErr) throw roleErr;
        await writeAdminAudit({
          action: "make_moderator",
          targetType: "user",
          targetId: userId,
          newValue: { role: "moderator" },
        });
        toast.success("User granted moderator");
      } else if (action === "remove_moderator") {
        if (!window.confirm("Remove moderator role from this user?")) {
          setActionLoading(false);
          return;
        }
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "moderator");
        if (error) throw error;
        await writeAdminAudit({
          action: "remove_moderator",
          targetType: "user",
          targetId: userId,
          oldValue: { role: "moderator" },
        });
        toast.success("Moderator role removed");
      } else {
        const patch: Record<string, unknown> = {};
        switch (action) {
          case "ban":
            patch.is_banned = true;
            break;
          case "unban":
            patch.is_banned = false;
            break;
          case "grant_pro":
            patch.plan_id = "pro";
            break;
          case "add_credits":
            patch.add_credits = 100;
            patch.reason = "Admin portal grant";
            break;
          default:
            throw new Error("Unknown action");
        }
        const { error } = await supabase.rpc("bulk_update_users", {
          p_user_ids: [userId],
          p_patch: patch as any,
        });
        if (error) throw error;
        toast.success("User updated");
      }
    } catch (err) {
      toast.error(adminActionFailedMessage(err, "AdminUsers.action"));
    } finally {
      setActionLoading(false);
      setSelected(null);
      void fetchUsers();
    }
  }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = page * PAGE_SIZE + users.length;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Users
          <Badge variant="default" size="sm">{total.toLocaleString()}</Badge>
        </h1>
      </div>
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          leftIcon={<Search className="w-4 h-4" />}
          className="sm:w-64"
          fullWidth={false}
        />
        <div className="flex gap-1.5">
          {["all", "pro", "free"].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFilter(f);
                setPage(0);
              }}
              className={cn(
                "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all capitalize",
                filter === f
                  ? "bg-primary/20 border-primary/30 text-primary/80"
                  : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      {fetchError && (
        <InlineErrorRetry message={fetchError} onRetry={() => void fetchUsers()} />
      )}
      <Card padding="none" className="overflow-hidden">
        <DataTable
          loading={loading}
          skeletonRows={5}
          skeletonColumns={7}
          isEmpty={!loading && users.length === 0}
          empty={
            <EmptyState
              icon={Users}
              title="No users found"
              description={
                search.trim()
                  ? "Try a different search term or filter."
                  : "No users match the current filter."
              }
              compact
            />
          }
        >
          <table className="w-full text-sm min-w-[640px]">
            <TableHeader>
              <TableRow>
                {["Name", "Email", "Plan", "Credits", "Admin", "Joined", "Actions"].map((h) => (
                  <TableHead
                    key={h || "actions"}
                    className="text-[10px] text-muted-foreground uppercase tracking-widest"
                    scope="col"
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow
                  key={u.id}
                  className={cn(u.is_banned && "opacity-60")}
                >
                  <TableCell className="font-medium text-foreground">
                    {u.full_name ?? "—"}
                    {u.is_banned && (
                      <Badge variant="red" size="sm" className="ml-2">
                        Banned
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {u.email ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.plan_id === "free" ? "default" : "violet"} size="sm">
                      {u.plan_id ?? "free"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.credits ?? 0}</TableCell>
                  <TableCell>
                    {u.is_admin && (
                      <Badge variant="red" size="sm">
                        admin
                      </Badge>
                    )}
                    {u.is_moderator && !u.is_admin && (
                      <Badge variant="default" size="sm">
                        moderator
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {format(new Date(u.created_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setSelected(u)}
                      className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                      aria-label="User actions"
                    >
                      <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </table>
        </DataTable>
      </Card>
      {!loading && total > 0 && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-muted-foreground">
            Showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {total.toLocaleString()} users
          </p>
          {totalPages > 1 && (
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (page > 0) setPage((p) => p - 1);
                    }}
                    className={cn(page === 0 && "pointer-events-none opacity-50")}
                    aria-disabled={page === 0}
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (page < totalPages - 1) setPage((p) => p + 1);
                    }}
                    className={cn(page >= totalPages - 1 && "pointer-events-none opacity-50")}
                    aria-disabled={page >= totalPages - 1}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      )}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="User actions" size="sm">
        {selected && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-3">
              {selected.full_name ?? selected.email}
            </p>
            {[
              { action: "grant_pro", label: "Grant Pro plan", icon: Zap },
              { action: "add_credits", label: "Add 100 credits", icon: Zap },
              { action: "make_admin", label: "Make admin", icon: Shield },
              ...(selected.is_admin
                ? [{ action: "remove_admin", label: "Remove admin", icon: Shield }]
                : []),
              ...(selected.is_moderator
                ? [{ action: "remove_moderator", label: "Remove moderator", icon: Shield }]
                : [{ action: "make_moderator", label: "Make moderator", icon: Shield }]),
              {
                action: selected.is_banned ? "unban" : "ban",
                label: selected.is_banned ? "Reinstate user" : "Suspend user",
                icon: Ban,
              },
            ].map(({ action, label, icon: Icon }) => (
              <Button
                key={action}
                variant="secondary"
                size="sm"
                fullWidth
                disabled={actionLoading}
                leftIcon={<Icon className="w-4 h-4" />}
                onClick={() => void handleAction(action, selected.id)}
              >
                {label}
              </Button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
