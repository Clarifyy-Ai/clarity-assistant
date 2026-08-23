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

type HelpArticle = {
  id: string;
  slug: string;
  category_slug: string;
  category_title: string;
  question: string;
  answer: string;
  body_md: string | null;
  sort_order: number;
  published: boolean;
};

const emptyForm = (): Omit<HelpArticle, "id"> => ({
  slug: "",
  category_slug: "getting-started",
  category_title: "Getting started",
  question: "",
  answer: "",
  body_md: "",
  sort_order: 0,
  published: false,
});

export default function AdminHelpArticles() {
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<HelpArticle> & { question: string; slug: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from("help_articles")
        .select("id,slug,category_slug,category_title,question,answer,body_md,sort_order,published")
        .order("sort_order", { ascending: true });
      if (search.trim()) {
        q = q.or(`question.ilike.%${search.trim()}%,slug.ilike.%${search.trim()}%`);
      }
      const { data, error: err } = await q;
      if (err) throw err;
      setArticles((data as HelpArticle[]) ?? []);
    } catch (e) {
      setError(toAdminUserMessage(e, undefined, "AdminHelp.load"));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!editing?.question.trim() || !editing.slug.trim()) {
      toast.error("Question and slug are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        slug: editing.slug.trim(),
        category_slug: editing.category_slug,
        category_title: editing.category_title,
        question: editing.question.trim(),
        answer: editing.answer,
        body_md: editing.body_md,
        sort_order: editing.sort_order,
        published: editing.published,
      };
      if (editing.id) {
        const { error: err } = await supabase.from("help_articles").update(payload).eq("id", editing.id);
        if (err) throw err;
        await writeAdminAudit({
          action: editing.published ? "publish" : "update",
          targetType: "help_article",
          targetId: editing.id,
          newValue: { slug: payload.slug, published: payload.published },
        });
      } else {
        const { data, error: err } = await supabase.from("help_articles").insert(payload).select("id").maybeSingle();
        if (err || !data) throw err ?? new Error("insert failed");
        await writeAdminAudit({
          action: "create",
          targetType: "help_article",
          targetId: data.id,
          newValue: { slug: payload.slug },
        });
      }
      toast.success("Help article saved");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(adminActionFailedMessage(e, "AdminHelp.save"));
    } finally {
      setSaving(false);
    }
  }

  async function setPublished(article: HelpArticle, published: boolean) {
    const { error: err } = await supabase
      .from("help_articles")
      .update({ published })
      .eq("id", article.id);
    if (err) {
      toast.error(adminActionFailedMessage(err));
      return;
    }
    await writeAdminAudit({
      action: published ? "publish" : "unpublish",
      targetType: "help_article",
      targetId: article.id,
      newValue: { published },
    });
    toast.success(published ? "Published" : "Unpublished");
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Help Articles CMS</h1>
          <p className="text-sm text-muted-foreground">Manage FAQ / help center content.</p>
        </div>
        <Button type="button" onClick={() => setEditing(emptyForm())}>New article</Button>
      </div>

      <Input
        placeholder="Search question or slug…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {error && <InlineErrorRetry message={error} onRetry={() => void load()} />}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : articles.length === 0 ? (
        <EmptyState title="No articles" description="Create a draft article." />
      ) : (
        <ul className="space-y-2">
          {articles.map((a) => (
            <li key={a.id}>
              <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-medium">{a.question}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.category_title} · /{a.slug}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{a.published ? "published" : "draft"}</Badge>
                  <Button size="xs" variant="outline" onClick={() => setEditing(a)}>Edit</Button>
                  <a
                    href={`/help/${a.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-xs hover:bg-secondary"
                  >
                    Preview
                  </a>
                  {a.published ? (
                    <Button size="xs" variant="outline" onClick={() => void setPublished(a, false)}>Unpublish</Button>
                  ) : (
                    <Button size="xs" onClick={() => void setPublished(a, true)}>Publish</Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <Card className="space-y-3 p-4">
          <h2 className="font-medium">{editing.id ? "Edit article" : "New article"}</h2>
          <Input placeholder="Question" value={editing.question} onChange={(e) => setEditing({ ...editing, question: e.target.value })} />
          <Input placeholder="Slug" value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
          <Input placeholder="Category slug" value={editing.category_slug} onChange={(e) => setEditing({ ...editing, category_slug: e.target.value })} />
          <Input placeholder="Category title" value={editing.category_title} onChange={(e) => setEditing({ ...editing, category_title: e.target.value })} />
          <Input
            type="number"
            placeholder="Sort order"
            value={editing.sort_order}
            onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) || 0 })}
          />
          <Textarea placeholder="Short answer" value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} />
          <Textarea className="min-h-[160px]" placeholder="Body (markdown)" value={editing.body_md ?? ""} onChange={(e) => setEditing({ ...editing, body_md: e.target.value })} />
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
