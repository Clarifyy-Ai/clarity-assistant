import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { COMMUNITY_CATEGORIES } from "@/lib/community/moderation";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";
import { EmptyState } from "@/components/common/EmptyState";
import { MessageSquare } from "lucide-react";

type Post = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  category: string;
  status: string;
  created_at: string;
};

export default function CommunityPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [category, setCategory] = useState("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [postCategory, setPostCategory] = useState("Interview");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setError(null);
    let q = supabase.from("community_posts").select("*").order("created_at", { ascending: false }).limit(50);
    if (category !== "all") q = q.eq("category", category);
    const { data, error } = await q;
    if (error) { setError("Community could not be loaded."); setPosts([]); setLoaded(true); return; }
    setPosts((data as Post[]) ?? []);
    setLoaded(true);
  }

  useEffect(() => { void load(); }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ask() {
    if (!user?.id || !title.trim() || !body.trim() || title.trim().length > 200 || body.trim().length > 10000) {
      toast.error("Enter a title and body within the allowed limits."); return;
    }
    if (saving) return;
    setSaving(true);
    const { error } = await supabase.from("community_posts").insert({
      user_id: user.id,
      title: title.trim(),
      body: body.trim(),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      category: postCategory,
      status: "PUBLISHED",
    });
    if (error) toast.error("Your question could not be posted.");
    else {
      setTitle("");
      setBody("");
      setTags("");
      void load();
    }
    setSaving(false);
  }

  const isPreview = loaded && posts.length === 0;

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Questions & Answers"
        breadcrumbs={[{ label: "Dashboard", href: "/app/dashboard" }, { label: "Questions & Answers" }]}
        badge="Preview"
        description={
          isPreview
            ? "Preview — Clarify’s own community for interview questions. This is not a third-party forum."
            : "Ask interview and career questions. This is Clarify’s own community, not a third-party forum."
        }
      />
      {error ? (
        <EmptyState title="Community unavailable" description={error} actionLabel="Retry" onAction={() => void load()} />
      ) : isPreview && (
        <EmptyState
          icon={MessageSquare}
          title="No published questions yet"
          description="Content is unpublished. You can still ask the first question below."
          actionLabel={isAdmin ? "Open Admin Community" : undefined}
          onAction={isAdmin ? () => navigate("/app/admin/community") : undefined}
          compact
        />
      )}
      <Card className="mb-4 space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ask a question" />
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a description" />
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags (comma separated)" />
        <Select value={postCategory} onValueChange={setPostCategory}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {COMMUNITY_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button loading={saving} disabled={saving} onClick={() => void ask()}>Post question</Button>
      </Card>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" variant={category === "all" ? "primary" : "outline"} onClick={() => setCategory("all")}>All</Button>
        {COMMUNITY_CATEGORIES.map((c) => (
          <Button key={c} size="sm" variant={category === c ? "primary" : "outline"} onClick={() => setCategory(c)}>
            {c}
          </Button>
        ))}
      </div>
      <ul className="space-y-2">
        {posts.map((post) => (
          <li key={post.id}>
            <Link to={`/app/community/${post.id}`}>
              <Card hover className="min-w-0">
                <p className="font-medium break-words">{post.title}</p>
                <p className="text-xs text-muted-foreground">{post.category} · {post.status} · {(post.tags ?? []).join(", ")}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
