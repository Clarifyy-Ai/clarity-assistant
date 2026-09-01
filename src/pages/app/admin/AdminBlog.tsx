import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { supabase } from "@/lib/supabase/client";
import { writeAdminAudit } from "@/lib/admin/writeAdminAudit";
import { adminActionFailedMessage, toAdminUserMessage } from "@/lib/admin/adminErrors";

type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  author: string;
  published: boolean;
  published_at: string;
  read_time: string | null;
};

const emptyForm = (): Omit<BlogPost, "id"> => ({
  slug: "",
  title: "",
  excerpt: "",
  content: "",
  category: "Product",
  author: "Career Pilot",
  published: false,
  published_at: new Date().toISOString(),
  read_time: "5 min",
});

export default function AdminBlog() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<BlogPost> & { title: string; slug: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from("blog_posts")
        .select("id,slug,title,excerpt,content,category,author,published,published_at,read_time")
        .order("published_at", { ascending: false });
      if (search.trim()) q = q.or(`title.ilike.%${search.trim()}%,slug.ilike.%${search.trim()}%`);
      const { data, error: err } = await q;
      if (err) throw err;
      setPosts((data as BlogPost[]) ?? []);
    } catch (e) {
      setError(toAdminUserMessage(e, undefined, "AdminBlog.load"));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkSlugUnique(slug: string, exceptId?: string): Promise<string | null> {
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) return "Slug is required";
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(trimmed)) {
      return "Slug must be lowercase alphanumeric with hyphens (e.g. my-post)";
    }
    const { data, error } = await supabase
      .from("blog_posts")
      .select("id, slug")
      .eq("slug", trimmed);
    if (error) return toAdminUserMessage(error, undefined, "AdminBlog.slugCheck");
    const clash = (data ?? []).find((row) => row.id !== exceptId);
    if (clash) {
      return `Slug "${trimmed}" already in use. Use a unique slug (e.g. ${trimmed}-2).`;
    }
    return null;
  }

  async function save() {
    if (!editing?.title.trim() || !editing.slug.trim()) {
      toast.error("Title and slug are required");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const slugError = await checkSlugUnique(editing.slug, editing.id);
      if (slugError) {
        toast.error(slugError);
        setSaving(false);
        return;
      }
      const payload = {
        slug: editing.slug.trim().toLowerCase(),
        title: editing.title.trim(),
        excerpt: editing.excerpt,
        content: editing.content,
        category: editing.category,
        author: editing.author,
        published: editing.published,
        published_at: editing.published
          ? editing.published_at || new Date().toISOString()
          : editing.published_at,
        read_time: editing.read_time,
      };
      if (editing.id) {
        const { error: err } = await supabase.from("blog_posts").update(payload).eq("id", editing.id);
        if (err) throw err;
        await writeAdminAudit({
          action: editing.published ? "publish" : "update",
          targetType: "blog_post",
          targetId: editing.id,
          newValue: { slug: payload.slug, published: payload.published },
        });
      } else {
        const { data, error: err } = await supabase.from("blog_posts").insert(payload).select("id").maybeSingle();
        if (err || !data) throw err ?? new Error("insert failed");
        await writeAdminAudit({
          action: "create",
          targetType: "blog_post",
          targetId: data.id,
          newValue: { slug: payload.slug, published: payload.published },
        });
      }
      toast.success("Blog post saved");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(adminActionFailedMessage(e, "AdminBlog.save"));
    } finally {
      setSaving(false);
    }
  }

  async function setPublished(post: BlogPost, published: boolean) {
    const { error: err } = await supabase
      .from("blog_posts")
      .update({ published, published_at: published ? new Date().toISOString() : post.published_at })
      .eq("id", post.id);
    if (err) {
      toast.error(adminActionFailedMessage(err));
      return;
    }
    await writeAdminAudit({
      action: published ? "publish" : "unpublish",
      targetType: "blog_post",
      targetId: post.id,
      newValue: { published },
    });
    toast.success(published ? "Published" : "Unpublished");
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Blog CMS</h1>
          <p className="text-sm text-muted-foreground">Create and publish posts for the public blog.</p>
        </div>
        <Button type="button" onClick={() => setEditing(emptyForm())}>New post</Button>
      </div>

      <Input
        placeholder="Search title or slug…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {error && <InlineErrorRetry message={error} onRetry={() => void load()} />}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : posts.length === 0 ? (
        <EmptyState title="No posts" description="Create a draft to get started." />
      ) : (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-medium">{p.title}</p>
                  <p className="text-xs text-muted-foreground">/{p.slug} · {p.category}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{p.published ? "published" : "draft"}</Badge>
                  <Button size="xs" variant="outline" onClick={() => setEditing(p)}>Edit</Button>
                  <a
                    href={`/blog/${p.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-xs hover:bg-secondary"
                  >
                    Preview
                  </a>
                  {p.published ? (
                    <Button size="xs" variant="outline" onClick={() => void setPublished(p, false)}>Unpublish</Button>
                  ) : (
                    <Button size="xs" onClick={() => void setPublished(p, true)}>Publish</Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <Card className="space-y-3 p-4">
          <h2 className="font-medium">{editing.id ? "Edit post" : "New post"}</h2>
          <Input placeholder="Title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          <Input
            placeholder="Slug"
            value={editing.slug}
            onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
          />
          <Input placeholder="Category" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
          <Input placeholder="Author" value={editing.author} onChange={(e) => setEditing({ ...editing, author: e.target.value })} />
          <Input placeholder="Read time" value={editing.read_time ?? ""} onChange={(e) => setEditing({ ...editing, read_time: e.target.value })} />
          <Textarea placeholder="Excerpt" value={editing.excerpt} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} />
          <Textarea className="min-h-[200px]" placeholder="Content (markdown/HTML)" value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editing.published}
              onChange={(e) => setEditing({ ...editing, published: e.target.checked })}
            />
            Published
          </label>
          <div className="flex gap-2">
            <Button disabled={saving} onClick={() => void save()}>Save</Button>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
