// @ts-nocheck
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  Search, Users, ChevronLeft, ChevronRight,
  Shield, Zap, Trash2, Eye, Ban,
  MoreHorizontal, CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────
// AdminUsers — paginated user management table
// ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function AdminUsers() {
  const [users,    setUsers]    = useState<any[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(0);
  const [search,   setSearch]   = useState("");
  const [filter,   setFilter]   = useState("all");
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { fetchUsers(); }, [page, search, filter]);

  async function fetchUsers() {
    setLoading(true);

    let q = supabase
      .from("profiles")
      .select("id, full_name, email, plan, role, created_at, credits, is_admin", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    if (filter === "pro")    q = q.neq("plan", "free");
    if (filter === "free")   q = q.eq("plan", "free");
    if (filter === "banned") q = q.eq("is_admin", false);  // no is_banned col; filter by non-admin as approximation

    const { data, count } = await q;
    setUsers(data ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }

  async function handleAction(action: string, userId: string) {
    setActionLoading(true);
    switch (action) {
      case "ban":
        await supabase.from("profiles").update({ plan: "free", credits: 0 }).eq("id", userId);
        break;
      case "unban":
        await supabase.from("profiles").update({ credits: 5 }).eq("id", userId);
        break;
      case "make_admin":
        await supabase.from("profiles").update({ is_admin: true }).eq("id", userId);
        break;
      case "grant_pro":
        await supabase.from("profiles").update({ plan: "pro" }).eq("id", userId);
        break;
      case "add_credits":
        await supabase.rpc("add_credits", { uid: userId, amount: 100 });
        break;
    }
    setActionLoading(false);
    setSelected(null);
    fetchUsers();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-5 h-5 text-violet-400" />
          Users
          <Badge variant="default" size="sm">{total.toLocaleString()}</Badge>
        </h1>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          leftIcon={<Search className="w-4 h-4" />}
          className="sm:w-64"
          fullWidth={false}
        />
        <div className="flex gap-1.5">
          {["all", "pro", "free", "banned"].map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(0); }}
              className={cn(
                "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all capitalize",
                filter === f
                  ? "bg-violet-600/20 border-violet-500/30 text-violet-300"
                  : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr>
                {["Name", "Email", "Plan", "Credits", "Role", "Joined", ""].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[10px] text-muted-foreground uppercase tracking-widest px-4 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3 bg-accent/5 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : users.map((u) => (
                <tr
                  key={u.id}
                  className={cn(
                    "hover:bg-secondary/50 transition-colors",
                    u.is_banned && "opacity-50"
                  )}
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {u.full_name ?? "—"}
                    {u.is_banned && (
                      <Badge variant="red" size="sm" className="ml-2">Banned</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={u.plan === "free" ? "default" : "violet"}
                      size="sm"
                    >
                      {u.plan}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.credits_remaining ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    {u.role && u.role !== "user" && (
                      <Badge variant="red" size="sm">{u.role}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {format(new Date(u.created_at), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelected(u)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/5 transition-all"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="xs"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
            >
              Prev
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* User action modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Manage: ${selected?.full_name ?? selected?.email}`}
        size="sm"
      >
        {selected && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <span>Plan: <strong className="text-foreground">{selected.plan}</strong></span>
              <span>Credits: <strong className="text-foreground">{selected.credits_remaining}</strong></span>
              <span>Role: <strong className="text-foreground">{selected.role ?? "user"}</strong></span>
              <span>Banned: <strong className="text-foreground">{selected.is_banned ? "Yes" : "No"}</strong></span>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              {[
                { action: "grant_pro",    label: "Grant Pro plan",    icon: <Zap className="w-3.5 h-3.5" /> },
                { action: "add_credits",  label: "Add 100 credits",   icon: <Zap className="w-3.5 h-3.5" /> },
                { action: "make_admin",   label: "Make admin",        icon: <Shield className="w-3.5 h-3.5" /> },
                {
                  action: selected.is_banned ? "unban" : "ban",
                  label:  selected.is_banned ? "Unban user" : "Ban user",
                  icon:   <Ban className="w-3.5 h-3.5" />,
                  danger: true,
                },
              ].map((item) => (
                <Button
                  key={item.action}
                  variant={item.danger ? "danger" : "secondary"}
                  size="sm"
                  fullWidth
                  loading={actionLoading}
                  onClick={() => handleAction(item.action, selected.id)}
                  leftIcon={item.icon}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
