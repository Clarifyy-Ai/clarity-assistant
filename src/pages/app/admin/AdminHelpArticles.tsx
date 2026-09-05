import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { supabase } from "@/lib/supabase/client";
import { writeAdminAudit } from "@/lib/admin/writeAdminAudit";
import { adminActionFailedMessage, toAdminUserMessage } from "@/lib/admin/adminErrors";
import { sanitizeAdminSearch } from "@/lib/admin/searchFilter";
import { isValidHelpSlug, slugifyHelpQuestion } from "@/lib/admin/helpArticleSlug";
import { invalidatePublicContentCache } from "@/lib/cms/publicContentCache";
import { AdminStatGrid } from "@/components/admin/AdminStatGrid";
import { BookOpen, Eye, EyeOff, FolderOpen } from "lucide-react";

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
  const [deleteTarget, setDeleteTarget] = useState<HelpArticle | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openNewArticle = () => {
    setEditing(emptyForm());
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from("help_articles")
        .select("id,slug,category_slug,category_title,question,answer,body_md,sort_order,published")
        .order("sort_order", { ascending: true });
      const qTerm = sanitizeAdminSearch(search);
      if (qTerm) {
        q = q.or(`question.ilike.%${qTerm}%,slug.ilike.%${qTerm}%`);
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

  function normalizeQuestion(q: string) {
    return q.trim().toLowerCase().replace(/\s+/g, " ");
  }

  async function checkSlugUnique(slug: string, exceptId?: string): Promise<string | null> {
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) return "Slug is required";
    if (!isValidHelpSlug(trimmed)) {
      return "Slug must be lowercase alphanumeric with hyphens (e.g. how-credits-work)";
    }
    const { data, error } = await supabase
      .from("help_articles")
      .select("id, slug")
      .eq("slug", trimmed);
    if (error) return toAdminUserMessage(error, undefined, "AdminHelp.slugCheck");
    const clash = (data ?? []).find((row) => row.id !== exceptId);
    if (clash) {
      return `Slug "${trimmed}" is already in use. Choose a unique slug.`;
    }
    return null;
  }

  /** One published canonical FAQ per question text. */
  async function assertNoPublishedQuestionConflict(
    question: string,
    exceptId?: string,
  ): Promise<string | null> {
    const needle = normalizeQuestion(question);
    if (!needle) return "Question is required";
    const { data, error } = await supabase
      .from("help_articles")
      .select("id, slug, question")
      .eq("published", true);
    if (error) return toAdminUserMessage(error, undefined, "AdminHelp.dupCheck");
    const clash = (data ?? []).find(
      (row) =>
        row.id !== exceptId &&
        normalizeQuestion(row.question || "") === needle,
    );
    if (clash) {
      return `A published article already uses this question (/${clash.slug}). Unpublish it first or edit that article.`;
    }
    return null;
  }

  async function save() {
    if (!editing?.question.trim() || !editing.slug.trim()) {
      toast.error("Question and slug are required");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const slugError = await checkSlugUnique(editing.slug, editing.id);
      if (slugError) {
        toast.error(slugError);
        return;
      }
      const payload = {
        slug: editing.slug.trim().toLowerCase(),
        category_slug: editing.category_slug,
        category_title: editing.category_title,
        question: editing.question.trim(),
        answer: editing.answer,
        body_md: editing.body_md,
        sort_order: editing.sort_order,
        published: editing.published,
      };
      if (payload.published) {
        const conflict = await assertNoPublishedQuestionConflict(
          payload.question,
          editing.id,
        );
        if (conflict) {
          toast.error(conflict);
          return;
        }
      }
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
      toast.success(editing.published ? "Help article published" : "Help article saved as draft");
      invalidatePublicContentCache(["help"]);
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(adminActionFailedMessage(e, "AdminHelp.save"));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error: err } = await supabase
        .from("help_articles")
        .delete()
        .eq("id", deleteTarget.id);
      if (err) throw err;
      await writeAdminAudit({
        action: "delete",
        targetType: "help_article",
        targetId: deleteTarget.id,
        oldValue: { slug: deleteTarget.slug, question: deleteTarget.question },
      });
      toast.success("Help article deleted");
      invalidatePublicContentCache(["help"]);
      setDeleteTarget(null);
      if (editing?.id === deleteTarget.id) setEditing(null);
      await load();
    } catch (e) {
      toast.error(adminActionFailedMessage(e, "AdminHelp.delete"));
    } finally {
      setDeleting(false);
    }
  }

  async function setPublished(article: HelpArticle, published: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      if (published) {
        const conflict = await assertNoPublishedQuestionConflict(
          article.question,
          article.id,
        );
        if (conflict) {
          toast.error(conflict);
          return;
        }
      }
      const { error: err } = await supabase
        .from("help_articles")
        .update({ published })
        .eq("id", article.id);
      if (err) throw err;
      await writeAdminAudit({
        action: published ? "publish" : "unpublish",
        targetType: "help_article",
        targetId: article.id,
        newValue: { published },
      });
      toast.success(published ? "Published" : "Unpublished");
      invalidatePublicContentCache(["help"]);
      await load();
    } catch (e) {
      toast.error(adminActionFailedMessage(e, "AdminHelp.publish"));
    } finally {
      setSaving(false);
    }
  }

  const helpDash = useMemo(() => ({
    total: articles.length,
    published: articles.filter((a) => a.published).length,
    drafts: articles.filter((a) => !a.published).length,
    categories: new Set(articles.map((a) => a.category_slug)).size,
  }), [articles]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Help Articles CMS</h1>
          <p className="text-sm text-muted-foreground">Manage FAQ / help center content.</p>
        </div>
        <Button type="button" onClick={openNewArticle} data-testid="help-new-article">
          New article
        </Button>
      </div>

      <AdminStatGrid
        loading={loading}
        stats={[
          { id: "total", label: "Total articles", value: helpDash.total.toLocaleString(), icon: BookOpen },
          { id: "published", label: "Published", value: helpDash.published.toLocaleString(), variant: "success", icon: Eye },
          { id: "drafts", label: "Drafts", value: helpDash.drafts.toLocaleString(), icon: EyeOff },
          { id: "categories", label: "Categories", value: helpDash.categories.toLocaleString(), icon: FolderOpen },
        ]}
      />

      {editing && (
        <Card className="space-y-3 p-4 min-w-0" data-testid="help-article-editor">
          <div>
            <h2 className="text-base font-semibold">{editing.id ? "Edit article" : "New article"}</h2>
            <p className="text-sm text-muted-foreground">Create or update a help center FAQ entry.</p>
          </div>
          <Input
            label="Title"
            placeholder="Question"
            value={editing.question}
            onChange={(e) => {
              const question = e.target.value;
              setEditing((prev) => {
                if (!prev) return prev;
                const next = { ...prev, question };
                if (!prev.id && !prev.slug.trim()) {
                  next.slug = slugifyHelpQuestion(question);
                }
                return next;
              });
            }}
          />
          <Input
            label="Slug"
            placeholder="Slug"
            value={editing.slug}
            onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
          />
          <Input placeholder="Category slug" label="Category slug" value={editing.category_slug} onChange={(e) => setEditing({ ...editing, category_slug: e.target.value })} />
          <Input placeholder="Category title" label="Category title" value={editing.category_title} onChange={(e) => setEditing({ ...editing, category_title: e.target.value })} />
          <Input
            type="number"
            label="Sort order"
            placeholder="Sort order"
            value={editing.sort_order}
            onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) || 0 })}
          />
          <Textarea placeholder="Short answer" aria-label="Short answer" value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} />
          <Textarea className="min-h-[160px]" placeholder="Body (markdown)" aria-label="Body markdown" value={editing.body_md ?? ""} onChange={(e) => setEditing({ ...editing, body_md: e.target.value })} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editing.published}
              onChange={(e) => setEditing({ ...editing, published: e.target.checked })}
            />
            Published
          </label>
          <div className="flex gap-2">
            <Button disabled={saving} onClick={() => void save()}>
              {editing.published ? "Save & publish" : "Save draft"}
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </Card>
      )}

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
        <EmptyState
          title="No articles"
          description="Create a draft article."
          actionLabel="New article"
          onAction={openNewArticle}
        />
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
                  {!a.published &&
                    articles.some(
                      (other) =>
                        other.published &&
                        other.id !== a.id &&
                        normalizeQuestion(other.question) ===
                          normalizeQuestion(a.question),
                    ) && (
                      <Badge variant="outline" className="text-amber-600 border-amber-500/40">
                        duplicate of published
                      </Badge>
                    )}
                  <Button size="xs" variant="outline" onClick={() => setEditing(a)}>Edit</Button>
                  <a
                    href={`/app/admin/help-articles/preview/${a.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-xs hover:bg-secondary"
                  >
                    Preview
                  </a>
                  <Button
                    size="xs"
                    variant="danger"
                    onClick={() => setDeleteTarget(a)}
                  >
                    Delete
                  </Button>
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

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete this help article?"
        description={
          deleteTarget
            ? `"${deleteTarget.question}" will be permanently removed.`
            : undefined
        }
        confirmLabel="Delete"
        variant="destructive"
        isLoading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
