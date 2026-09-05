import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Search, ChevronDown, ChevronUp, HelpCircle, Mail, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import { SUPPORT_EMAIL, STATUS_PAGE_URL } from "@/lib/constants/contact";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { ComplianceBanner } from "@/components/marketing";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import {
  HELP_FAQ_CATEGORIES_FALLBACK,
  HELP_ARTICLES_FALLBACK,
  groupHelpArticlesIntoCategories,
  resolveHelpArticleDisplay,
  dedupeHelpArticlesByQuestion,
  type HelpFaqCategory,
  type HelpArticleItem,
} from "@/lib/constants/helpArticlesFallback";
import { helpArticlesDB } from "@/lib/supabase/database";

const SITE_URL = "https://trycareerpilot.com";
const SEARCH_DEBOUNCE_MS = 300;

const POPULAR_ARTICLES = [...HELP_ARTICLES_FALLBACK]
  .sort((a, b) => a.sort_order - b.sort_order)
  .slice(0, 5);

function mapDbRowsToCategories(
  rows: Array<{
    slug: string;
    question: string;
    answer: string;
    body_md: string | null;
    category_slug: string;
    category_title: string;
    sort_order: number;
  }>,
): HelpFaqCategory[] {
  const cleaned: HelpArticleItem[] = rows.map((r) =>
    resolveHelpArticleDisplay({
      slug: r.slug,
      question: r.question,
      answer: r.answer,
      body_md: r.body_md,
      category_slug: r.category_slug,
      category_title: r.category_title,
      sort_order: r.sort_order,
    }),
  );
  // Ensure critical billing/free-plan answers exist even if DB omit them.
  const have = new Set(cleaned.map((a) => a.slug));
  for (const slug of ["gs-3", "bi-5"] as const) {
    if (!have.has(slug)) {
      const fb = HELP_ARTICLES_FALLBACK.find((a) => a.slug === slug);
      if (fb) cleaned.push(fb);
    }
  }
  const deduped = dedupeHelpArticlesByQuestion(cleaned);
  return groupHelpArticlesIntoCategories(deduped);
}

export default function Help() {
  usePageMeta({
    title: "Help Center — Clarify AI",
    description: "FAQs and guides for interview prep, live practice coaching, mock tests, and billing.",
    canonical: `${SITE_URL}/help`,
  });

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<HelpFaqCategory[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadArticles = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const rows = await helpArticlesDB.listPublished();
      setCategories(
        rows.length > 0
          ? mapDbRowsToCategories(rows)
          : HELP_FAQ_CATEGORIES_FALLBACK,
      );
    } catch {
      setFetchError("Couldn't load help articles. Showing cached FAQs.");
      setCategories(HELP_FAQ_CATEGORIES_FALLBACK);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadArticles();
  }, [loadArticles]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  function toggleItem(id: string) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = useMemo(() => {
    if (!categories) return [];
    const query = debouncedSearch.trim();
    if (!query) return categories;

    const lower = query.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.question.toLowerCase().includes(lower) ||
            item.answer.toLowerCase().includes(lower),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [categories, debouncedSearch]);

  const hasSearchQuery = debouncedSearch.trim().length > 0;
  const showPopularArticles = !loading && !hasSearchQuery;

  return (
    <MarketingLayout>
      <section className="pt-4 sm:pt-12 pb-14 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <HelpCircle className="w-8 h-8 text-primary mx-auto mb-4" />
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Help Center</h1>
            <p className="mt-4 text-sm md:text-base text-muted-foreground">Find answers to common questions about Clarify AI</p>
          </motion.div>

          <div className="mt-8 max-w-md mx-auto">
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search help articles..."
              aria-label="Search help articles"
              leftIcon={<Search className="w-4 h-4" />}
              className="rounded-xl bg-secondary/60 border-border focus:border-primary/40"
            />
          </div>
        </div>
      </section>

      <section className="pb-8 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <ComplianceBanner />
        </div>
      </section>

      <section className="pb-14 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto space-y-10">
          {fetchError && (
            <InlineErrorRetry message={fetchError} onRetry={() => void loadArticles()} />
          )}

          {loading && (
            <div className="space-y-6" aria-busy="true" aria-label="Loading help articles">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2 animate-pulse">
                  <div className="h-5 w-40 rounded bg-secondary/60" />
                  <div className="h-14 rounded-xl bg-secondary/40" />
                  <div className="h-14 rounded-xl bg-secondary/40" />
                </div>
              ))}
            </div>
          )}

          {!loading && showPopularArticles && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <h2 className="text-xl font-bold mb-4">Popular articles</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {POPULAR_ARTICLES.map((article) => (
                  <Link
                    key={article.slug}
                    to={`/help/${article.slug}`}
                    className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 hover:border-primary/30 hover:bg-secondary/30 transition-all text-left"
                  >
                    <div className="flex items-start gap-2">
                      <BookOpen className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        {article.question}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 pl-6">
                      {article.answer}
                    </p>
                    <span className="text-[11px] text-primary pl-6 opacity-0 group-hover:opacity-100 transition-opacity">
                      Read article &rarr;
                    </span>
                  </Link>
                ))}
              </div>
            </motion.div>
          )}

          {!loading && filtered.map((category) => (
            <motion.div
              key={category.slug}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
            >
              <h2 className="text-xl font-bold mb-4" id={category.slug}>{category.title}</h2>
              <div className="space-y-2">
                {category.items.map((item) => {
                  const isOpen = openItems.has(item.slug);
                  return (
                    <div key={item.slug} className="rounded-xl border border-border bg-card overflow-hidden">
                      <button
                        onClick={() => toggleItem(item.slug)}
                        aria-expanded={isOpen}
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/40 transition-all"
                      >
                        <span className="text-sm font-medium pr-4">{item.question}</span>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4">
                          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{item.answer}</p>
                          <Link
                            to={`/help/${item.slug}`}
                            className="inline-block mt-2 text-xs text-primary hover:underline"
                          >
                            Read full article &rarr;
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ))}

          {!loading && filtered.length === 0 && (
            <EmptyState
              icon={Search}
              title={hasSearchQuery ? "No articles found" : "No help articles yet"}
              description={
                hasSearchQuery
                  ? `Nothing matched "${debouncedSearch.trim()}". Try different keywords or browse all categories.`
                  : "Check back soon — we're adding guides and FAQs regularly."
              }
              actionLabel={hasSearchQuery ? "Clear search" : undefined}
              onAction={hasSearchQuery ? () => setSearch("") : undefined}
              compact
            />
          )}
        </div>
      </section>

      <section className="pb-14 px-4 sm:px-6">
        <div className="max-w-xl mx-auto text-center rounded-2xl border border-border bg-card p-8">
          <Mail className="w-8 h-8 text-primary mx-auto mb-3" />
          <h3 className="text-lg font-bold">Still need help?</h3>
          <p className="text-sm text-muted-foreground mt-2">Our support team is here to help you get the most out of Clarify AI.</p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex items-center gap-2 mt-5 px-6 py-2.5 rounded-xl bg-secondary text-sm font-semibold hover:bg-secondary/80 transition-all"
          >
            <Mail className="w-4 h-4" /> Contact Support
          </a>
          <p className="text-sm text-muted-foreground mt-4">
            System status:{" "}
            {STATUS_PAGE_URL ? (
              <a
                href={STATUS_PAGE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                View status page
              </a>
            ) : (
              <span className="text-sm text-muted-foreground">
                No public status page configured —{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Clarify AI system status")}`}
                  className="text-sm text-primary hover:underline"
                >
                  email {SUPPORT_EMAIL}
                </a>{" "}
                for outages.
              </span>
            )}
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}
