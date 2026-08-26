import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { supabase } from "@/lib/supabase/client";
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

export default function CommunityPostPage() {
  const { postId } = useParams<{ postId: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);

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

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title={post?.title ?? "Question"}
        breadcrumbs={[{ label: "Q&A", href: "/app/community" }, { label: post?.title ?? "Question" }]}
        badge="Preview"
        description="Preview / Deferred — replies, votes, and reports are not in launch scope."
      />
      <Card className="min-w-0">
        <p className="whitespace-pre-wrap text-sm">{post?.body}</p>
        <p className="mt-2 text-xs text-muted-foreground">{post?.category} · {post?.status}</p>
      </Card>
      <h2 className="mt-6 text-sm font-semibold">Answers</h2>
      {answers.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No answers yet. Replying is deferred for launch.</p>
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
      <Card className="mt-4 border-dashed">
        <p className="text-sm font-medium">Interactions deferred</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Answer, comment, vote, and report actions are not available in this Preview build.
        </p>
      </Card>
    </div>
  );
}
