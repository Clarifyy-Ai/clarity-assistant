import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";

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
  const user = useAuthStore((s) => s.user);
  const [post, setPost] = useState<Post | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [reply, setReply] = useState("");
  const [reportReason, setReportReason] = useState<string>(REPORT_REASONS[0]);
  const [reportNotes, setReportNotes] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

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

  useEffect(() => {
    if (!post) return;
  }, [post, answers.length]);

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
    if (!user?.id || !postId) return;
    setReportBusy(true);
    const reason = [reportReason, reportNotes.trim()].filter(Boolean).join(": ").slice(0, 500);
    const { data, error } = await supabase
      .from("community_reports")
      .insert({
        reporter_id: user.id,
        target_type: "post",
        target_id: postId,
        reason,
      })
      .select("id,status")
      .maybeSingle();
    setReportBusy(false);
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        toast.error("You already reported this post.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Report submitted for moderation.");
    setReportNotes("");
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title={post?.title ?? "Question"}
        breadcrumbs={[{ label: "Q&A", href: "/app/community" }, { label: post?.title ?? "Question" }]}
        description="Reply to help others, or report content that needs moderation."
      />
      <Card className="min-w-0">
        <p className="whitespace-pre-wrap text-sm">{post?.body}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {post?.category} · {post?.status}
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
