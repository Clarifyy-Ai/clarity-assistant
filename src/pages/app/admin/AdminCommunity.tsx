import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { supabase } from "@/lib/supabase/client";
import { applyHide, applyRestore, applyResolve } from "@/lib/community/moderation";

type Post = { id: string; title: string; status: string; locked: boolean };
type Report = { id: string; target_type: string; target_id: string; reason: string; status: string };

export default function AdminCommunityPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [reports, setReports] = useState<Report[]>([]);

  async function load() {
    const [{ data: postRows }, { data: reportRows }] = await Promise.all([
      supabase.from("community_posts").select("id,title,status,locked").order("created_at", { ascending: false }).limit(50),
      supabase.from("community_reports").select("*").eq("status", "open").order("created_at", { ascending: false }),
    ]);
    setPosts((postRows as Post[]) ?? []);
    setReports((reportRows as Report[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("community_posts").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else void load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Q&A moderation</h1>
      <Card>
        <h2 className="font-medium">Open reports</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{r.target_type} · {r.reason}</span>
              <Button size="xs" onClick={() => void supabase.from("community_reports").update({ status: "reviewed" }).eq("id", r.id).then(() => load())}>
                Review
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <ul className="space-y-2">
        {posts.map((post) => (
          <li key={post.id}>
            <Card className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{post.title}</p>
                <p className="text-xs text-muted-foreground">{post.status} {post.locked ? "· locked" : ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="xs" variant="outline" onClick={() => void setStatus(post.id, applyHide())}>Hide</Button>
                <Button size="xs" variant="outline" onClick={() => void setStatus(post.id, applyRestore())}>Restore</Button>
                <Button size="xs" variant="outline" onClick={() => void setStatus(post.id, applyResolve())}>Resolve</Button>
                <Button size="xs" variant="outline" onClick={() => void supabase.from("community_posts").update({ locked: !post.locked }).eq("id", post.id).then(() => load())}>
                  {post.locked ? "Unlock" : "Lock"}
                </Button>
                <Button size="xs" variant="danger" onClick={() => void supabase.from("community_posts").delete().eq("id", post.id).then(() => load())}>
                  Delete
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
