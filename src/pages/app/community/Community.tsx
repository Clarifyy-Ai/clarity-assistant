import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/Badge";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { COMMUNITY_CATEGORIES, COMMUNITY_MODULE_DESCRIPTION, COMMUNITY_MODULE_LABEL, canPublicRead, type CommunityCategory } from "@/lib/community/moderation";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";
import { EmptyState } from "@/components/common/EmptyState";
import { MessageSquare } from "lucide-react";

type Post = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  tags: string[];
  category: string;
  status: string;
  created_at: string;
};

function showReportedBadge(
  post: Post,
  userId: string | undefined,
  isStaff: boolean,
): boolean {
  return (
    post.status === "REPORTED" &&
    (isStaff || (!!userId && post.user_id === userId))
  );
}

export default function CommunityPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const isModerator = useAuthStore((s) => s.isModerator);
  const isStaff = isAdmin || isModerator;
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [category, setCategory] = useState("all");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [postCategory, setPostCategory] = useState<CommunityCategory>("Interview");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setError(null);
    let q = supabase.from("community_posts").select("*").order("created_at", { ascending: false }).limit(50);
    if (category !== "all") q = q.eq("category", category);
    const { data, error: loadError } = await q;
    if (loadError) {
      setError("Community could not be loaded.");
      setPosts([]);
      setLoaded(true);
      return;
    }
    setPosts(
      ((data as Post[]) ?? []).filter((post) =>
        canPublicRead(post.status as Parameters<typeof canPublicRead>[0], post.user_id === user?.id, isStaff),
      ),
    );
    setLoaded(true);
  }

  useEffect(() => {
    void load();
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (window.location.hash !== "#community-create-question") return;
    window.requestAnimationFrame(() => {
      document.getElementById("community-create-question")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [loaded]);

  async function createPost() {
    if (!user?.id) {
      toast.error("Sign in to create a post.");
      return;
    }
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) {
      toast.error("Title and body are required.");
      return;
    }
    setSaving(true);
    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8);
    const { data, error: insertError } = await supabase
      .from("community_posts")
      .insert({
        user_id: user.id,
        title: trimmedTitle,
        body: trimmedBody,
        category: postCategory,
        tags: tagList,
        status: "PUBLISHED",
      })
      .select("id,title,status")
      .maybeSingle();
    setSaving(false);
    if (insertError || !data) {
      toast.error(insertError?.message ?? "Could not create post.");
      return;
    }
    toast.success("Post published.");
    setTitle("");
    setBody("");
    setTags("");
    void load();
    navigate(`/app/community/${data.id}`);
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title={COMMUNITY_MODULE_LABEL}
        breadcrumbs={[{ label: "Dashboard", href: "/app/dashboard" }, { label: COMMUNITY_MODULE_LABEL }]}
        description={COMMUNITY_MODULE_DESCRIPTION}
        actions={
          <div className="flex gap-2">
            {user ? (
              <Button
                size="sm"
                onClick={() =>
                  document.getElementById("community-create-question")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  })
                }
              >
                Ask a question
              </Button>
            ) : (
              <Button size="sm" onClick={() => navigate("/login")}>
                Sign in to ask
              </Button>
            )}
            {isStaff ? (
              <Button size="sm" variant="outline" onClick={() => navigate("/app/admin/community")}>
                Moderation
              </Button>
            ) : null}
          </div>
        }
      />
      {error ? (
        <EmptyState title="Community unavailable" description={error} actionLabel="Retry" onAction={() => void load()} />
      ) : null}

      <Card className="mb-4 space-y-3" data-testid="community-create-question" id="community-create-question">
        <h2 className="text-sm font-semibold">Ask a question</h2>
        <p className="text-xs text-muted-foreground">
          Post an interview, career, or exam prep question. Published posts are visible to the community.
        </p>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Question title"
          aria-label="Post title"
        />
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Describe your question or scenario"
          aria-label="Post body"
        />
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[10rem] flex-1">
            <label className="text-xs text-muted-foreground" htmlFor="community-category">
              Category
            </label>
            <select
              id="community-category"
              value={postCategory}
              onChange={(e) => setPostCategory(e.target.value as CommunityCategory)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              {COMMUNITY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[10rem] flex-[2]">
            <label className="text-xs text-muted-foreground" htmlFor="community-tags">
              Tags (comma-separated)
            </label>
            <Input
              id="community-tags"
              className="mt-1"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="behavioral, system-design"
            />
          </div>
        </div>
        <Button
          onClick={() => void createPost()}
          loading={saving}
          disabled={saving || !user}
          data-testid="community-publish-question"
        >
          {user ? "Publish question" : "Sign in to publish"}
        </Button>
      </Card>

      {!error && loaded && posts.length === 0 && (
        <EmptyState
          icon={MessageSquare}
          title="No published questions yet"
          description="Be the first to ask a question. Published posts appear here for the community."
          compact
        />
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" variant={category === "all" ? "primary" : "outline"} onClick={() => setCategory("all")}>
          All
        </Button>
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
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium break-words">{post.title}</p>
                  {showReportedBadge(post, user?.id, isStaff) && (
                    <Badge variant="amber" size="sm" dot>
                      Reported
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {post.category}
                  {isStaff && post.status !== "PUBLISHED" ? ` · ${post.status}` : ""}
                  {(post.tags ?? []).length > 0 ? ` · ${(post.tags ?? []).join(", ")}` : ""}
                </p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
