import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { usePageMeta } from "@/hooks/usePageMeta";
import { supabase } from "@/lib/supabase/client";

interface Article {
  slug: string;
  question: string;
  answer: string;
  body_md: string | null;
  category_slug: string;
  category_title: string;
  sort_order: number;
}

const SITE_URL = "https://clarify.ai.sltfinanceindia.com";

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-sm font-bold text-foreground mt-5 mb-1.5">{renderInline(line.slice(4))}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-base font-bold text-foreground mt-6 mb-2">{renderInline(line.slice(3))}</h2>);
    } else if (line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal list-inside space-y-1 my-3 text-muted-foreground text-sm">
          {items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
        </ol>
      );
      continue;
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc list-inside space-y-1 my-3 text-muted-foreground text-sm">
          {items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
        </ul>
      );
      continue;
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="text-sm text-muted-foreground leading-relaxed">{renderInline(line)}</p>);
    }
    i++;
  }
  return elements;
}

function NotFound() {
  usePageMeta({
    title: "Article not found — Help — Clarify AI",
    description: "The requested help article could not be found.",
    noIndex: true,
  });
  return (
    <MarketingLayout>
      <div className="pt-32 pb-24 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Article not found</p>
          <Link to="/help" className="text-primary hover:underline text-sm">Back to Help Center</Link>
        </div>
      </div>
    </MarketingLayout>
  );
}

export default function HelpArticle() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [article, setArticle] = useState<Article | null>(null);
  const [categoryArticles, setCategoryArticles] = useState<Article[] | null>(null);
  const [related, setRelated] = useState<Article[]>([]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      // Try category match first
      const { data: catRows } = await (supabase as any)
        .from("help_articles")
        .select("slug, question, answer, body_md, category_slug, category_title, sort_order")
        .eq("category_slug", slug)
        .eq("published", true)
        .order("sort_order", { ascending: true });

      if (cancelled) return;

      if (catRows && catRows.length > 0) {
        setCategoryArticles(catRows as Article[]);
        setArticle(null);
        setRelated([]);
        setLoading(false);
        return;
      }

      // Single article lookup
      const { data } = await (supabase as any)
        .from("help_articles")
        .select("slug, question, answer, body_md, category_slug, category_title, sort_order")
        .eq("slug", slug)
        .eq("published", true)
        .maybeSingle();

      if (cancelled) return;

      if (!data) {
        setArticle(null);
        setCategoryArticles(null);
        setLoading(false);
        return;
      }

      setArticle(data as Article);
      setCategoryArticles(null);

      const { data: siblings } = await (supabase as any)
        .from("help_articles")
        .select("slug, question, answer, body_md, category_slug, category_title, sort_order")
        .eq("category_slug", (data as Article).category_slug)
        .eq("published", true)
        .neq("slug", slug)
        .order("sort_order", { ascending: true })
        .limit(3);

      if (!cancelled) setRelated((siblings as Article[]) ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const pageTitle = categoryArticles
    ? `${categoryArticles[0]?.category_title ?? "Help"} — Help — Clarify AI`
    : article
      ? `${article.question} — Help — Clarify AI`
      : "Help — Clarify AI";
  const pageDesc = categoryArticles
    ? `Help articles about ${categoryArticles[0]?.category_title?.toLowerCase() ?? "Clarify AI"}.`
    : article
      ? article.answer.replace(/\*\*/g, "").slice(0, 155)
      : "Clarify AI help center.";

  usePageMeta({
    title: pageTitle,
    description: pageDesc,
    canonical: slug ? `${SITE_URL}/help/${slug}` : `${SITE_URL}/help`,
    ogType: article ? "article" : "website",
    jsonLd: article
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: article.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: (article.body_md ?? article.answer).replace(/\*\*/g, ""),
              },
            },
          ],
        }
      : undefined,
  });

  if (loading) {
    return (
      <MarketingLayout>
        <section className="pt-32 pb-20 px-6">
          <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
            <div className="h-4 w-32 rounded bg-secondary/60" />
            <div className="h-8 w-3/4 rounded bg-secondary/60" />
            <div className="h-24 rounded-xl bg-secondary/40" />
          </div>
        </section>
      </MarketingLayout>
    );
  }

  if (categoryArticles) {
    return (
      <MarketingLayout>
        <section className="pt-32 pb-20 px-6">
          <div className="max-w-2xl mx-auto">
            <Link to="/help" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
              <ArrowLeft className="w-4 h-4" /> Back to Help Center
            </Link>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <h1 className="text-3xl font-bold mb-8">{categoryArticles[0].category_title}</h1>
              <div className="space-y-8">
                {categoryArticles.map((a) => (
                  <div key={a.slug} className="border-b border-border pb-8 last:border-0">
                    <h2 className="text-lg font-semibold text-foreground mb-4">{a.question}</h2>
                    <div>{renderMarkdown(a.body_md ?? a.answer)}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      </MarketingLayout>
    );
  }

  if (!article) return <NotFound />;

  return (
    <MarketingLayout>
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-2xl mx-auto">
          <Link to="/help" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to Help Center
          </Link>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="text-xs text-primary font-medium">{article.category_title}</span>
            <h1 className="text-3xl font-bold mt-2 mb-6">{article.question}</h1>
            <div>{renderMarkdown(article.body_md ?? article.answer)}</div>
          </motion.div>

          {related.length > 0 && (
            <div className="mt-12 pt-8 border-t border-border">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Related Articles</h3>
              <div className="space-y-2">
                {related.map((ra) => (
                  <Link
                    key={ra.slug}
                    to={`/help/${ra.slug}`}
                    className="block p-3 rounded-xl border border-border bg-card hover:bg-card/80 hover:border-primary/30 transition-all text-sm text-muted-foreground hover:text-foreground"
                  >
                    {ra.question}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </MarketingLayout>
  );
}
