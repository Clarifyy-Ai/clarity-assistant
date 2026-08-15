import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { applyReport } from "@/lib/community/moderation";
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
type Comment = { id: string; answer_id: string | null; body: string; user_id: string };

export default function CommunityPostPage() {
  const { postId } = useParams<{ postId: string }>();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [post, setPost] = useState<Post | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [answer, setAnswer] = useState("");
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    if (!postId) return;
    const [{ data: postRow }, { data: answerRows }, { data: commentRows }] = await Promise.all([
      supabase.from("community_posts").select("*").eq("id", postId).maybeSingle(),
      supabase.from("community_answers").select("*").eq("post_id", postId).order("created_at"),
      supabase.from("community_comments").select("*").eq("post_id", postId).order("created_at"),
    ]);
    setPost(postRow as Post | null);
    setAnswers((answerRows as Answer[]) ?? []);
    setComments((commentRows as Comment[]) ?? []);
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitAnswer() {
    if (!user?.id || !postId || !answer.trim() || post?.locked) return;
    const { error } = await supabase.from("community_answers").insert({
      post_id: postId,
      user_id: user.id,
      body: answer.trim(),
    });
    if (error) toast.error(error.message);
    else {
      setAnswer("");
      void load();
    }
  }

  async function vote(targetType: "post" | "answer", targetId: string, value: 1 | -1) {
    if (!user?.id) return;
    const { error } = await supabase.from("community_votes").upsert({
      user_id: user.id,
      target_type: targetType,
      target_id: targetId,
      value,
    });
    if (error) toast.error(error.message);
  }

  async function accept(answerId: string) {
    if (!post || post.user_id !== user?.id) return;
    await supabase.from("community_answers").update({ is_accepted: false }).eq("post_id", post.id);
    await supabase.from("community_answers").update({ is_accepted: true }).eq("id", answerId);
    await supabase.from("community_posts").update({ accepted_answer_id: answerId }).eq("id", post.id);
    void load();
  }

  async function report() {
    if (!user?.id || !post) return;
    await supabase.from("community_reports").insert({
      reporter_id: user.id,
      target_type: "post",
      target_id: post.id,
      reason: "Reported by user",
    });
    await supabase.from("community_posts").update({ status: applyReport(post.status as "PUBLISHED") }).eq("id", post.id);
    toast.success("Reported for review.");
    void load();
  }

  async function addComment(answerId: string | null) {
    if (!user?.id || !postId || !comment.trim()) return;
    await supabase.from("community_comments").insert({
      post_id: postId,
      answer_id: answerId,
      user_id: user.id,
      body: comment.trim(),
    });
    setComment("");
    void load();
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title={post?.title ?? "Question"}
        breadcrumbs={[{ label: "Q&A", href: "/app/community" }, { label: post?.title ?? "Question" }]}
      />
      <Card className="min-w-0">
        <p className="whitespace-pre-wrap text-sm">{post?.body}</p>
        <p className="mt-2 text-xs text-muted-foreground">{post?.category} · {post?.status}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void vote("post", post?.id ?? "", 1)}>Upvote</Button>
          <Button size="sm" variant="outline" onClick={() => void vote("post", post?.id ?? "", -1)}>Downvote</Button>
          <Button size="sm" variant="ghost" onClick={() => void report()}>Report</Button>
        </div>
      </Card>
      <h2 className="mt-6 text-sm font-semibold">Answers</h2>
      <ul className="mt-2 space-y-2">
        {answers.map((item) => (
          <li key={item.id}>
            <Card>
              {item.is_accepted && <p className="text-xs font-semibold text-emerald-600">Accepted answer</p>}
              <p className="whitespace-pre-wrap text-sm">{item.body}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="xs" variant="outline" onClick={() => void vote("answer", item.id, 1)}>Upvote</Button>
                {post?.user_id === user?.id && (
                  <Button size="xs" onClick={() => void accept(item.id)}>Mark accepted</Button>
                )}
                {isAdmin && (
                  <Button size="xs" variant="outline" onClick={() => void accept(item.id)}>Mark answer</Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {!post?.locked && (
        <Card className="mt-4 space-y-2">
          <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Write an answer" />
          <Button onClick={() => void submitAnswer()}>Answer</Button>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment" />
          <Button variant="outline" onClick={() => void addComment(answers[0]?.id ?? null)}>Comment</Button>
        </Card>
      )}
    </div>
  );
}
