import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, MessageSquare, Flag, EyeOff, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { supabase } from "@/lib/supabase/client";
import {
  applyHide,
  applyRestore,
  applyResolve,
  COMMUNITY_MODULE_LABEL,
  moderationStatusBadgeVariant,
  moderationStatusLabel,
  type ModerationState,
} from "@/lib/community/moderation";
import { runCommunityModeration, type ModerationAction } from "@/lib/community/moderationActions";
import { writeAdminAudit } from "@/lib/admin/writeAdminAudit";
import { adminActionFailedMessage, toAdminUserMessage } from "@/lib/admin/adminErrors";
import { AdminSectionDashboard } from "@/components/admin/AdminSectionDashboard";
import { AdminRecentActivityList } from "@/components/admin/AdminRecentActivityList";
import { COMMUNITY_QUICK_LINKS } from "@/lib/admin/adminSectionNav";
import { cn } from "@/lib/utils";

type Post = {
  id: string;
  title: string;
  status: string;
  locked: boolean;
  category: string;
  created_at: string;
};

type Report = {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  status: string;
  created_at: string;
};

const STATUS_FILTERS = ["all", "PUBLISHED", "REPORTED", "HIDDEN", "RESOLVED", "PENDING"] as const;

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={moderationStatusBadgeVariant(status)} size="sm">
      {moderationStatusLabel(status)}
    </Badge>
  );
}

export default function AdminCommunityPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: postRows, error: pErr }, { data: reportRows, error: rErr }] = await Promise.all([
        supabase
          .from("community_posts")
          .select("id,title,status,locked,category,created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("community_reports")
          .select("id,target_type,target_id,reason,status,created_at")
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

  const postById = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);

  const communityDash = useMemo(() => ({
    total: posts.length,
    published: posts.filter((p) => p.status === "PUBLISHED").length,
    reported: posts.filter((p) => p.status === "REPORTED").length,
    hidden: posts.filter((p) => p.status === "HIDDEN").length,
    openReports: reports.length,
  }), [posts, reports]);

  async function withModeration(
    key: string,
    action: ModerationAction,
    targetId: string,
    audit: Parameters<typeof writeAdminAudit>[0],
    successMessage: string,
  ) {
    setBusyKey(key);
    try {
      await runCommunityModeration(action, targetId);
      await writeAdminAudit(audit);
      toast.success(successMessage);
      await load();
    } catch (err) {
      toast.error(adminActionFailedMessage(err));
    } finally {
      setBusyKey(null);
    }
  }

  async function setPostStatus(id: string, status: ModerationState) {
    const action: ModerationAction =
      status === "HIDDEN" ? "hide_post" : status === "RESOLVED" ? "resolve_post" : "restore_post";
    await withModeration(
      `${action}:${id}`,
      action,
      id,
      { action: "update", targetType: "community_post", targetId: id, newValue: { status } },
      status === "HIDDEN" ? "Post hidden from public feed" : "Post updated",
    );
  }

  async function toggleLock(post: Post) {
    const locked = !post.locked;
    const action: ModerationAction = locked ? "lock_post" : "unlock_post";
    await withModeration(
      `${action}:${post.id}`,
      action,
      post.id,
      { action: "update", targetType: "community_post", targetId: post.id, newValue: { locked } },
      locked ? "Post locked" : "Post unlocked",
    );
  }

  async function deletePost(id: string) {
    if (!window.confirm("Delete this post permanently? Answers and comments will also be removed.")) return;
    await withModeration(
      `delete_post:${id}`,
      "delete_post",
      id,
      { action: "delete", targetType: "community_post", targetId: id },
      "Post deleted",
    );
  }

  async function deleteAnswer(id: string) {
    if (!window.confirm("Delete this answer permanently?")) return;
    await withModeration(
      `delete_answer:${id}`,
      "delete_answer",
      id,
      { action: "delete", targetType: "community_answer", targetId: id },
      "Answer deleted",
    );
  }

  async function resolveReport(report: Report) {
    await withModeration(
      `resolve_report:${report.id}`,
      "resolve_report",
      report.id,
      {
        action: "update",
        targetType: "community_report",
        targetId: report.id,
        newValue: { status: "reviewed" },
      },
      "Report resolved",
    );
  }

  async function dismissReport(report: Report) {
    await withModeration(
      `dismiss_report:${report.id}`,
      "dismiss_report",
      report.id,
      {
        action: "update",
        targetType: "community_report",
        targetId: report.id,
        newValue: { status: "dismissed" },
      },
      "Report dismissed",
    );
  }

  async function hideReportedTarget(report: Report) {
    if (report.target_type === "post") {
      await setPostStatus(report.target_id, applyHide());
      return;
    }
    if (report.target_type === "answer") {
      await deleteAnswer(report.target_id);
    }
  }

  const filtered = posts.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (!filter.trim()) return true;
    const q = filter.trim().toLowerCase();
    return (
      p.title.toLowerCase().includes(q)
      || p.status.toLowerCase().includes(q)
      || p.category.toLowerCase().includes(q)
    );
  });

  function reportTargetLabel(report: Report): string {
    if (report.target_type === "post") {
      return postById.get(report.target_id)?.title ?? `Post ${report.target_id.slice(0, 8)}…`;
    }
    return `${report.target_type} ${report.target_id.slice(0, 8)}…`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{COMMUNITY_MODULE_LABEL} moderation</h1>
          <p className="text-sm text-muted-foreground">
            Hide, restore, lock, or delete community posts. Resolve or dismiss open user reports.
            Hidden posts are removed from the public Community feed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => void load()} loading={loading}>
            Refresh
          </Button>
          <Button size="sm" onClick={() => navigate("/app/community#community-create-question")}>
            Create post
          </Button>
        </div>
      </div>

      <AdminSectionDashboard
        loading={loading}
        columns={5}
        quickLinks={COMMUNITY_QUICK_LINKS}
        activityTitle="Open reports"
        activity={
          <AdminRecentActivityList
            emptyMessage="No open reports."
            items={reports.slice(0, 5).map((report) => ({
              id: report.id,
              title: reportTargetLabel(report),
              subtitle: report.reason,
              badge: report.status,
              badgeVariant: "danger",
              meta: format(new Date(report.created_at), "MMM d"),
            }))}
          />
        }
        stats={[
          {
            id: "total",
            label: "Posts loaded",
            value: communityDash.total.toLocaleString(),
            icon: MessageSquare,
            onClick: () => setStatusFilter("all"),
            active: statusFilter === "all",
          },
          {
            id: "published",
            label: "Published",
            value: communityDash.published.toLocaleString(),
            variant: "success",
            icon: CheckCircle2,
            onClick: () => setStatusFilter("PUBLISHED"),
            active: statusFilter === "PUBLISHED",
          },
          {
            id: "reported",
            label: "Reported",
            value: communityDash.reported.toLocaleString(),
            variant: "warning",
            icon: Flag,
            onClick: () => setStatusFilter("REPORTED"),
            active: statusFilter === "REPORTED",
          },
          {
            id: "hidden",
            label: "Hidden",
            value: communityDash.hidden.toLocaleString(),
            icon: EyeOff,
            onClick: () => setStatusFilter("HIDDEN"),
            active: statusFilter === "HIDDEN",
          },
          {
            id: "reports",
            label: "Open reports",
            value: communityDash.openReports.toLocaleString(),
            variant: "danger",
            icon: Flag,
            description: "Scroll to reports panel",
            onClick: () => {
              document.getElementById("community-open-reports")?.scrollIntoView({ behavior: "smooth" });
            },
          },
        ]}
      />

      {error && <InlineErrorRetry message={error} onRetry={() => void load()} />}

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((value) => (
          <Button
            key={value}
            size="sm"
            variant={statusFilter === value ? "primary" : "outline"}
            onClick={() => setStatusFilter(value)}
          >
            {value === "all" ? "All statuses" : moderationStatusLabel(value)}
          </Button>
        ))}
      </div>

      <Input
        placeholder="Filter posts by title, category, or status…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-md"
      />

      <Card className="p-4" id="community-open-reports">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">Open reports ({reports.length})</h2>
        </div>
        {loading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : reports.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No open reports.</p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm">
            {reports.map((r) => {
              const busy = busyKey?.endsWith(r.id) ?? false;
              const linkedPost = r.target_type === "post" ? postById.get(r.target_id) : undefined;
              return (
                <li key={r.id} className="rounded-lg border border-border/70 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium break-words">{reportTargetLabel(r)}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.target_type} · {r.reason}
                      </p>
                      {linkedPost && (
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={linkedPost.status} />
                          {linkedPost.locked && <Badge variant="gray" size="sm">Locked</Badge>}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {r.target_type === "post" && (
                        <Link
                          to={`/app/community/${r.target_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-7 items-center rounded-md border border-border px-2 text-xs font-medium hover:bg-muted"
                        >
                          <ExternalLink className="mr-1 h-3 w-3" />
                          View
                        </Link>
                      )}
                      <Button size="xs" variant="outline" loading={busy} onClick={() => void resolveReport(r)}>
                        Resolve
                      </Button>
                      <Button size="xs" variant="outline" loading={busy} onClick={() => void dismissReport(r)}>
                        Dismiss
                      </Button>
                      {(r.target_type === "post" || r.target_type === "answer") && (
                        <Button size="xs" variant="danger" loading={busy} onClick={() => void hideReportedTarget(r)}>
                          {r.target_type === "post" ? "Hide post" : "Delete answer"}
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading posts…</p>
      ) : filtered.length === 0 ? (
        <EmptyState title="No posts" description="No community posts match this filter." />
      ) : (
        <ul className="space-y-2">
          {filtered.map((post) => {
            const rowBusy = busyKey?.includes(post.id) ?? false;
            return (
              <li key={post.id}>
                <Card className={cn("flex flex-wrap items-center justify-between gap-3 p-4", rowBusy && "opacity-70")}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium break-words">{post.title}</p>
                      <StatusBadge status={post.status} />
                      {post.locked && <Badge variant="gray" size="sm">Locked</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {post.category} · {new Date(post.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={`/app/community/${post.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-7 items-center rounded-md border border-border px-2 text-xs font-medium hover:bg-muted"
                    >
                      View
                    </Link>
                    {post.status !== "HIDDEN" && (
                      <Button
                        size="xs"
                        variant="outline"
                        loading={rowBusy}
                        onClick={() => void setPostStatus(post.id, applyHide())}
                      >
                        Hide
                      </Button>
                    )}
                    {post.status !== "PUBLISHED" && (
                      <Button
                        size="xs"
                        variant="outline"
                        loading={rowBusy}
                        onClick={() => void setPostStatus(post.id, applyRestore())}
                      >
                        Restore
                      </Button>
                    )}
                    {post.status === "REPORTED" && (
                      <Button
                        size="xs"
                        variant="outline"
                        loading={rowBusy}
                        onClick={() => void setPostStatus(post.id, applyResolve())}
                      >
                        Mark resolved
                      </Button>
                    )}
                    <Button size="xs" variant="outline" loading={rowBusy} onClick={() => void toggleLock(post)}>
                      {post.locked ? "Unlock" : "Lock"}
                    </Button>
                    <Button size="xs" variant="danger" loading={rowBusy} onClick={() => void deletePost(post.id)}>
                      Delete
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
