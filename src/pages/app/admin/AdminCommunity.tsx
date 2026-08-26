import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { supabase } from "@/lib/supabase/client";
import { applyHide, applyRestore, applyResolve } from "@/lib/community/moderation";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { writeAdminAudit } from "@/lib/admin/writeAdminAudit";
import { adminActionFailedMessage, toAdminUserMessage } from "@/lib/admin/adminErrors";

type Post = { id: string; title: string; status: string; locked: boolean };
type Report = {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  status: string;
};

export default function AdminCommunityPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: postRows, error: pErr }, { data: reportRows, error: rErr }] = await Promise.all([
        supabase
          .from("community_posts")
          .select("id,title,status,locked")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("community_reports")
          .select("id,target_type,target_id,reason,status")
          .eq("status", "open")
          .order("created_at", { ascending: false }),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      setPosts((postRows as Post[]) ?? []);
      setReports((reportRows as Report[]) ?? []);
    } catch (e) {
      setError(toAdminUserMessage(e, undefined, "AdminCommunity.load"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function moderate(action: string, targetId: string) {
    await fetchEdgeJson("moderate-content", { action, target_id: targetId });
  }

  async function setStatus(id: string, status: string) {
    try {
      await moderate(status === "HIDDEN" ? "hide_post" : "restore_post", id);
    } catch (err) {
      toast.error(adminActionFailedMessage(err));
      return;
    }
    await writeAdminAudit({
      action: "update",
      targetType: "community_post",
      targetId: id,
      newValue: { status },
    });
    toast.success("Post updated");
    await load();
  }

  async function toggleLock(post: Post) {
    const locked = !post.locked;
    try {
      await moderate(locked ? "lock_post" : "unlock_post", post.id);
    } catch (err) {
      toast.error(adminActionFailedMessage(err));
      return;
    }
    await writeAdminAudit({
      action: "update",
      targetType: "community_post",
      targetId: post.id,
      newValue: { locked },
    });
    await load();
  }

  async function deletePost(id: string) {
    if (!window.confirm("Delete this post permanently?")) return;
    const reason = window.prompt("Moderation reason (optional)") ?? "";
    try {
      await moderate("delete_post", id);
    } catch (err) {
      toast.error(adminActionFailedMessage(err));
      return;
    }
    await writeAdminAudit({
      action: "delete",
      targetType: "community_post",
      targetId: id,
      newValue: { reason },
    });
    toast.success("Post deleted");
    await load();
  }

  async function resolveReport(r: Report) {
    const reason = window.prompt("Resolution note (optional)") ?? "";
    try {
      await moderate("resolve_report", r.id);
    } catch (err) {
      toast.error(adminActionFailedMessage(err));
      return;
    }
    await writeAdminAudit({
      action: "update",
      targetType: "community_report",
      targetId: r.id,
      newValue: { status: "reviewed", reason },
    });
    await load();
  }

  const filtered = posts.filter(
    (p) =>
      !filter.trim() ||
      p.title.toLowerCase().includes(filter.trim().toLowerCase()) ||
      p.status.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Q&A moderation</h1>
        <p className="text-sm text-muted-foreground">
          Hide, restore, lock, or delete community posts. Resolve open user reports. Hidden posts are removed from the public Q&A feed.
        </p>
      </div>

      {error && <InlineErrorRetry message={error} onRetry={() => void load()} />}

      <Input
        placeholder="Filter posts…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-md"
      />

      <Card className="p-4">
        <h2 className="font-medium">Open reports</h2>
        {loading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : reports.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No open reports.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {r.target_type} · {r.reason}
                </span>
                <Button size="xs" onClick={() => void resolveReport(r)}>
                  Resolve
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!loading && filtered.length === 0 ? (
        <EmptyState title="No posts" description="No community posts match this filter." />
      ) : (
        <ul className="space-y-2">
          {filtered.map((post) => (
            <li key={post.id}>
              <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-medium">{post.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {post.status} {post.locked ? "· locked" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="xs" variant="outline" onClick={() => void setStatus(post.id, applyHide())}>
                    Hide
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => void setStatus(post.id, applyRestore())}>
                    Restore
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => void setStatus(post.id, applyResolve())}>
                    Resolve
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => void toggleLock(post)}>
                    {post.locked ? "Unlock" : "Lock"}
                  </Button>
                  <Button size="xs" variant="danger" onClick={() => void deletePost(post.id)}>
                    Delete
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
