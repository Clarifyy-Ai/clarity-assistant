import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Search, ChevronDown, ChevronUp, HelpCircle, Mail } from "lucide-react";
import { motion } from "framer-motion";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { supabase } from "@/lib/supabase/client";

interface HelpRow {
  slug: string;
  question: string;
  answer: string;
  category_slug: string;
  category_title: string;
  sort_order: number;
}

interface FaqCategory {
  title: string;
  slug: string;
  items: HelpRow[];
}

const SITE_URL = "https://clarify.ai.sltfinanceindia.com";

export default function Help() {
  usePageMeta({
    title: "Help Center — Clarify AI",
    description: "FAQs and guides for interview prep, live coaching, mock tests, and billing.",
    canonical: `${SITE_URL}/help`,
  });

  const [search, setSearch] = useState("");
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<FaqCategory[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("help_articles")
        .select("slug, question, answer, category_slug, category_title, sort_order")
        .eq("published", true)
        .order("sort_order", { ascending: true });

      if (cancelled) return;

      if (error || !data) {
        setCategories([]);
        setLoading(false);
        return;
      }

      const byCat = new Map<string, FaqCategory>();
      (data as HelpRow[]).forEach((row) => {
        if (!byCat.has(row.category_slug)) {
          byCat.set(row.category_slug, {
            slug: row.category_slug,
            title: row.category_title,
            items: [],
          });
        }
        byCat.get(row.category_slug)!.items.push(row);
      });
      setCategories(Array.from(byCat.values()));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleItem(id: string) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = !categories
    ? []
    : search.trim()
      ? categories
          .map((cat) => ({
            ...cat,
            items: cat.items.filter(
              (item) =>
                item.question.toLowerCase().includes(search.toLowerCase()) ||
                item.answer.toLowerCase().includes(search.toLowerCase()),
            ),
          }))
          .filter((cat) => cat.items.length > 0)
      : categories;

  return (
    <MarketingLayout>
      <section className="pt-20 sm:pt-28 pb-14 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <HelpCircle className="w-8 h-8 text-primary mx-auto mb-4" />
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Help Center</h1>
            <p className="mt-4 text-sm md:text-base text-muted-foreground">Find answers to common questions about Clarify AI</p>
          </motion.div>

          <div className="mt-8 relative max-w-md mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search help articles..."
              className="w-full pl-11 pr-4 py-3 rounded-xl bg-secondary/60 border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/40"
            />
          </div>
        </div>
      </section>

      <section className="pb-14 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto space-y-10">
          {loading && (
            <div className="space-y-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2 animate-pulse">
                  <div className="h-5 w-40 rounded bg-secondary/60" />
                  <div className="h-14 rounded-xl bg-secondary/40" />
                  <div className="h-14 rounded-xl bg-secondary/40" />
                </div>
              ))}
            </div>
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
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {search ? `No articles found for "${search}"` : "No help articles available yet."}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="pb-14 px-4 sm:px-6">
        <div className="max-w-xl mx-auto text-center rounded-2xl border border-border bg-card p-8">
          <Mail className="w-8 h-8 text-primary mx-auto mb-3" />
          <h3 className="text-lg font-bold">Still need help?</h3>
          <p className="text-sm text-muted-foreground mt-2">Our support team is here to help you get the most out of Clarify AI.</p>
          <a
            href="mailto:support@clarifyai.com"
            className="inline-flex items-center gap-2 mt-5 px-6 py-2.5 rounded-xl bg-secondary text-sm font-semibold hover:bg-secondary/80 transition-all"
          >
            <Mail className="w-4 h-4" /> Contact Support
          </a>
        </div>
      </section>
    </MarketingLayout>
  );
}
