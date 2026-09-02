import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { supabase } from "@/lib/supabase/client";
import { toAdminUserMessage } from "@/lib/admin/adminErrors";

type HelpArticle = {
  id: string;
  slug: string;
  category_title: string;
  question: string;
  answer: string;
  body_md: string | null;
  published: boolean;
};

export default function AdminHelpArticlePreview() {
  const { id } = useParams<{ id: string }>();
  const [article, setArticle] = useState<HelpArticle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const { data, error: err } = await supabase
        .from("help_articles")
        .select("id,slug,category_title,question,answer,body_md,published")
        .eq("id", id)
        .maybeSingle();
      if (err) {
        setError(toAdminUserMessage(err, undefined, "AdminHelpPreview.load"));
        return;
      }
      setArticle(data as HelpArticle | null);
    })();
  }, [id]);

  if (error) {
    return (
      <InlineErrorRetry message={error} onRetry={() => window.location.reload()} />
    );
  }

  if (!article) {
    return <p className="text-sm text-muted-foreground">Loading preview…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Admin preview · {article.published ? "published" : "draft"}
        </p>
        <Link
          to="/app/admin/help-articles"
          className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs hover:bg-secondary"
        >
          Back to CMS
        </Link>
      </div>
      <Card className="p-6 space-y-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{article.category_title}</p>
        <h1 className="text-2xl font-semibold">{article.question}</h1>
        <p className="text-sm text-muted-foreground">{article.answer}</p>
        {article.body_md && (
          <pre className="whitespace-pre-wrap text-sm">{article.body_md}</pre>
        )}
      </Card>
    </div>
  );
}
