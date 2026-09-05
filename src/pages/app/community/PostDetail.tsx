import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";
import {
  COMMUNITY_MODULE_DESCRIPTION,
  COMMUNITY_MODULE_LABEL,
  canPublicRead,
  moderationStatusBadgeVariant,
  moderationStatusLabel,
} from "@/lib/community/moderation";
import { runCommunityModeration } from "@/lib/community/moderationActions";
import { adminActionFailedMessage } from "@/lib/admin/adminErrors";
import { submitCommunityReport } from "@/lib/community/reportContent";

type Post = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  tags: string[];
  category: string;
  status: string;
  locked: boolean;
  accepted_answer_id: string | null;
};
type Answer = { id: string; user_id: string; body: string; is_accepted: boolean; created_at: string };

const REPORT_REASONS = [
  "Spam or advertising",
  "Harassment or abuse",
  "Incorrect or misleading advice",
  "Off-topic",
  "Other",
] as const;

export default function CommunityPostPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const isModerator = useAuthStore((s) => s.isModerator);
  const isStaff = isAdmin || isModerator;
  const [post, setPost] = useState<Post | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [reply, setReply] = useState("");
  const [reportReason, setReportReason] = useState<string>(REPORT_REASONS[0]);
  const [reportNotes, setReportNotes] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [modBusy, setModBusy] = useState(false);
  const reportInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (!postId) return;
    const [{ data: postRow }, { data: answerRows }] = await Promise.all([
      supabase.from("community_posts").select("*").eq("id", postId).maybeSingle(),
      supabase.from("community_answers").select("*").eq("post_id", postId).order("created_at"),
    ]);
    setPost(postRow as Post | null);
    setAnswers((answerRows as Answer[]) ?? []);
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canViewPost =
    post &&
    canPublicRead(
      post.status as Parameters<typeof canPublicRead>[0],
      !!user?.id && post.user_id === user.id,
      isStaff,
    );

  async function moderatePost(
    action: "hide_post" | "restore_post" | "resolve_post" | "lock_post" | "unlock_post" | "delete_post",
  ) {
    if (!post?.id || modBusy) return;
    if (action === "delete_post" && !window.confirm("Delete this post permanently?")) return;
    setModBusy(true);
    try {
      await runCommunityModeration(action, post.id);
      toast.success("Moderation action applied.");
      if (action === "delete_post") {
        navigate("/app/community");
        return;
      }
      void load();
    } catch (err) {
      toast.error(adminActionFailedMessage(err));
    } finally {
      setModBusy(false);
    }
  }

  async function submitReply() {
    if (!user?.id || !postId || !post) return;
    if (post.locked) {
      toast.error("This post is locked.");
      return;
    }
    const trimmed = reply.trim();
    if (!trimmed) {
      toast.error("Enter an answer before submitting.");
      return;
    }
    setReplyBusy(true);
    const { data, error } = await supabase
      .from("community_answers")
      .insert({
        post_id: postId,
        user_id: user.id,
        body: trimmed,
      })
      .select("id")
      .maybeSingle();
    setReplyBusy(false);
    if (error || !data) {
      toast.error(error?.message ?? "Could not post reply.");
      return;
    }
    toast.success("Answer posted.");
    setReply("");
    void load();
  }

  async function submitReport() {
    if (!user?.id || !postId || reportInFlightRef.current) return;
    reportInFlightRef.current = true;
    setReportBusy(true);
    try {
      const reason = [reportReason, reportNotes.trim()].filter(Boolean).join(": ").slice(0, 500);
      const result = await submitCommunityReport({
        reporterId: user.id,
        targetType: "post",
        targetId: postId,
        reason,
      });
      if (!result.ok) {
        toast.error((result as { message?: string }).message ?? "Could not submit report.");
        return;
      }
      if ((result as { alreadyReported?: boolean }).alreadyReported) {
        toast.success("You already reported this post.");
        return;
      }
      toast.success("Report submitted for moderation.");
      setReportNotes("");
      void load();
    } finally {
      reportInFlightRef.current = false;
      setReportBusy(false);
    }
  }

  if (post && !canViewPost) {
    return (
      <div className={PAGE_SHELL}>
        <EmptyState
          title="Post unavailable"
          description="This post has been hidden or removed."
          actionLabel="Back to Community"
          onAction={() => navigate("/app/community")}
        />
      </div>
    );
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title={post?.title ?? "Question"}
        breadcrumbs={[
          { label: COMMUNITY_MODULE_LABEL, href: "/app/community" },
          { label: post?.title ?? "Question" },
        ]}
        description={COMMUNITY_MODULE_DESCRIPTION}
      />

      {isStaff && post && (
        <Card className="mb-4 space-y-3 border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Staff moderation</p>
            <Badge variant={moderationStatusBadgeVariant(post.status)} size="sm">
              {moderationStatusLabel(post.status)}
            </Badge>
            {post.locked && <Badge variant="gray" size="sm">Locked</Badge>}
          </div>
          <div className="flex flex-wrap gap-2">
            {post.status !== "HIDDEN" && (
              <Button size="xs" variant="outline" loading={modBusy} onClick={() => void moderatePost("hide_post")}>
                Hide
              </Button>
            )}
            {post.status !== "PUBLISHED" && (
              <Button size="xs" variant="outline" loading={modBusy} onClick={() => void moderatePost("restore_post")}>
                Restore
              </Button>
            )}
            {post.status === "REPORTED" && (
              <Button size="xs" variant="outline" loading={modBusy} onClick={() => void moderatePost("resolve_post")}>
                Mark resolved
              </Button>
            )}
            <Button
              size="xs"
              variant="outline"
              loading={modBusy}
              onClick={() => void moderatePost(post.locked ? "unlock_post" : "lock_post")}
            >
              {post.locked ? "Unlock" : "Lock"}
            </Button>
            <Button size="xs" variant="danger" loading={modBusy} onClick={() => void moderatePost("delete_post")}>
              Delete
            </Button>
            <Button size="xs" variant="ghost" onClick={() => navigate("/app/admin/community")}>
              Open moderation queue
            </Button>
          </div>
        </Card>
      )}

      <Card className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {post?.status === "REPORTED" &&
            (isStaff || (user?.id && post.user_id === user.id)) && (
              <Badge variant="amber" size="sm" dot>
                Reported — under moderation review
              </Badge>
            )}
        </div>
        <p className="whitespace-pre-wrap text-sm">{post?.body}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {post?.category}
          {isStaff && post?.status ? ` · ${post.status}` : ""}
          {post?.locked ? " · locked" : ""}
        </p>
      </Card>

      <h2 className="mt-6 text-sm font-semibold">Answers</h2>
      {answers.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No answers yet. Be the first to reply.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {answers.map((item) => (
            <li key={item.id}>
              <Card>
                {item.is_accepted && <p className="text-xs font-semibold text-emerald-600">Accepted answer</p>}
                <p className="whitespace-pre-wrap text-sm">{item.body}</p>
                {isStaff && (
                  <Button
                    size="xs"
                    variant="danger"
                    className="mt-2"
                    loading={modBusy}
                    onClick={() => {
                      if (!window.confirm("Delete this answer?")) return;
                      void runCommunityModeration("delete_answer", item.id)
                        .then(() => {
                          toast.success("Answer deleted.");
                          void load();
                        })
                        .catch((err) => toast.error(adminActionFailedMessage(err)));
                    }}
                  >
                    Delete answer
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card className="mt-4 space-y-3">
        <h3 className="text-sm font-semibold">Your answer</h3>
        {post?.locked ? (
          <p className="text-sm text-muted-foreground">This post is locked. New replies are disabled.</p>
        ) : (
          <>
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a helpful answer"
              aria-label="Answer body"
            />
            <Button onClick={() => void submitReply()} loading={replyBusy} disabled={replyBusy || !user}>
              Post answer
            </Button>
          </>
        )}
      </Card>

      <Card className="mt-4 space-y-3">
        <h3 className="text-sm font-semibold">Report this post</h3>
        <label className="text-xs text-muted-foreground" htmlFor="report-reason">
          Reason
        </label>
        <select
          id="report-reason"
          value={reportReason}
          onChange={(e) => setReportReason(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
        >
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Textarea
          value={reportNotes}
          onChange={(e) => setReportNotes(e.target.value)}
          placeholder="Optional details for moderators"
          aria-label="Report details"
        />
        <Button variant="outline" onClick={() => void submitReport()} loading={reportBusy} disabled={reportBusy || !user}>
          Submit report
        </Button>
      </Card>
    </div>
  );
}
