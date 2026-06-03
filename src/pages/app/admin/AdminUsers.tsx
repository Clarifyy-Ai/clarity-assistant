import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { toast } from "sonner";
import {
  Search, Users, ChevronLeft, ChevronRight,
  Shield, Zap, Ban,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const PAGE_SIZE = 20;

interface UserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  plan_id: string | null;
  created_at: string;
  credits: number | null;
  is_admin: boolean | null;
  is_banned: boolean | null;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    void fetchUsers();
  }, [page, search, filter]);

  async function fetchUsers() {
    setLoading(true);
    try {
      let q = supabase
        .from("profiles")
        .select("id, full_name, email, plan_id, created_at, credits, is_admin, is_banned", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search.trim()) {
        q = q.or(`full_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
      }
      if (filter === "pro") {
        q = q.neq("plan_id", "free");
      }
      if (filter === "free") {
        q = q.eq("plan_id", "free");
      }

      const { data, count, error } = await q;
      if (error) throw error;

      setUsers((data as UserRow[]) ?? []);
      setTotal(count ?? 0);
    } catch (err) {
      console.error("[AdminUsers] fetch failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
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

        const { error: profileErr } = await supabase
          .from("profiles")
          .update({ is_admin: true })
          .eq("id", userId);
        if (profileErr) throw profileErr;

        toast.success("User promoted to admin");
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
      console.error("[AdminUsers] action failed:", err);
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
      setSelected(null);
      void fetchUsers();
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-5 h-5 text-violet-400" />
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
                  ? "bg-violet-600/20 border-violet-500/30 text-violet-300"
                  : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
            <thead className="border-b border-border">
              <tr>
                {["Name", "Email", "Plan", "Credits", "Admin", "Joined", ""].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[10px] text-muted-foreground uppercase tracking-widest px-4 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
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
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr
                    key={u.id}
                    className={cn(
                      "hover:bg-secondary/50 transition-colors",
                      u.is_banned && "opacity-60"
                    )}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {u.full_name ?? "—"}
                      {u.is_banned && (
                        <Badge variant="red" size="sm" className="ml-2">
                          Banned
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{u.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={u.plan_id === "free" ? "default" : "violet"} size="sm">
                        {u.plan_id ?? "free"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.credits ?? 0}</td>
                    <td className="px-4 py-3">
                      {u.is_admin && (
                        <Badge variant="red" size="sm">
                          admin
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {format(new Date(u.created_at), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelected(u)}
                        className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                        aria-label="User actions"
                      >
                        <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table></div>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              leftIcon={<ChevronLeft className="w-4 h-4" />}
            >
              Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              rightIcon={<ChevronRight className="w-4 h-4" />}
            >
              Next
            </Button>
          </div>
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
              {
                action: selected.is_banned ? "unban" : "ban",
                label: selected.is_banned ? "Unban user" : "Ban user",
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
