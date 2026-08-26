import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [category, setCategory] = useState("all");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    let q = supabase.from("community_posts").select("*").order("created_at", { ascending: false }).limit(50);
    if (category !== "all") q = q.eq("category", category);
    const { data, error: loadError } = await q;
    if (loadError) { setError("Community could not be loaded."); setPosts([]); setLoaded(true); return; }
    setPosts((data as Post[]) ?? []);
    setLoaded(true);
  }

  useEffect(() => { void load(); }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Questions & Answers"
        breadcrumbs={[{ label: "Dashboard", href: "/app/dashboard" }, { label: "Questions & Answers" }]}
        badge="Preview"
        description="Preview / Deferred for launch — browse-only. Create posts, replies, and reports are not in launch scope."
      />
      {error ? (
        <EmptyState title="Community unavailable" description={error} actionLabel="Retry" onAction={() => void load()} />
      ) : loaded && posts.length === 0 && (
        <EmptyState
          icon={MessageSquare}
          title="No published questions yet"
          description="Community posting is deferred for launch. Staff can review moderation tooling separately."
          actionLabel={isAdmin ? "Open Admin Community (Deferred)" : undefined}
          onAction={isAdmin ? () => navigate("/app/admin/community") : undefined}
          compact
        />
      )}
      <Card className="mb-4 space-y-2 border-dashed">
        <p className="text-sm font-medium">Posting unavailable in Preview</p>
        <p className="text-sm text-muted-foreground">
          Asking questions, answering, and reporting are deferred until Community ships. There is no create-post action in this build.
        </p>
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
