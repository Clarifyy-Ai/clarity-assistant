import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Calendar, Tag, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { usePageMeta } from "@/hooks/usePageMeta";
import { supabase } from "@/integrations/supabase/client";
import { FileText } from "lucide-react";

interface BlogPostMeta {
  slug: string;
  title: string;
  excerpt: string;
  published_at: string;
  category: string;
  author: string;
  read_time: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Interview Tips": "text-blue-400 bg-blue-500/10 border-blue-500/20",
  "Industry": "text-primary bg-primary/10 border-primary/20",
  "Technical": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  "Wellness": "text-amber-400 bg-amber-500/10 border-amber-500/20",
  "Research": "text-pink-400 bg-pink-500/10 border-pink-500/20",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function Blog() {
  const navigate = useNavigate();
  usePageMeta({
    title: "Blog — Clarify AI",
    description: "Interview prep guides, STAR method tips, and AI coaching insights from Clarify AI.",
    canonical: "/blog",
    ogType: "website",
  });

  const [posts, setPosts] = useState<BlogPostMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("blog_posts")
        .select("slug, title, excerpt, published_at, category, author, read_time")
        .eq("published", true)
        .order("published_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setPosts([]);
      } else {
        setPosts((data as BlogPostMeta[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MarketingLayout>
      <section className="pt-4 sm:pt-12 pb-14 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Blog</h1>
            <p className="mt-4 text-sm md:text-base text-muted-foreground">Insights, guides, and tips to help you ace every interview</p>
          </motion.div>
        </div>
      </section>

      <section className="pb-14 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-52 rounded-2xl border border-border bg-card/40 animate-pulse" />
              ))}
            </div>
          )}

          {!loading && error && (
            <InlineErrorRetry
              message={error}
              onRetry={() => {
                setLoading(true);
                setError(null);
                void (async () => {
                  const { data, error: err } = await (supabase as any)
                    .from("blog_posts")
                    .select("slug, title, excerpt, published_at, category, author, read_time")
                    .eq("published", true)
                    .order("published_at", { ascending: false });
                  if (err) {
                    setError(err.message);
                    setPosts([]);
                  } else {
                    setPosts((data as BlogPostMeta[]) ?? []);
                  }
                  setLoading(false);
                })();
              }}
            />
          )}

          {!loading && !error && posts.length === 0 && (
            <EmptyState
              icon={FileText}
              title="No posts yet"
              description="We're preparing guides and tips. Check back soon, or browse the Help Center."
              actionLabel="Visit Help Center"
              onAction={() => navigate("/help")}
            />
          )}

          {!loading && !error && posts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {posts.map((post, i) => (
                <motion.div
                  key={post.slug}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: i * 0.06 }}
                >
                  <Link
                    to={`/blog/${post.slug}`}
                    className="group flex flex-col h-full p-6 rounded-2xl border border-border bg-card hover:bg-card/80 hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border ${CATEGORY_COLORS[post.category] ?? "text-muted-foreground bg-secondary border-border"}`}>
                        <Tag className="w-3 h-3" /> {post.category}
                      </span>
                      {post.read_time && (
                        <span className="text-[11px] text-muted-foreground/70">{post.read_time}</span>
                      )}
                    </div>

                    <h2 className="text-base font-bold mb-2 group-hover:text-primary transition-colors">{post.title}</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed flex-1">{post.excerpt}</p>

                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                        <Calendar className="w-3 h-3" /> {formatDate(post.published_at)}
                      </div>
                      <span className="flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Read more <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>
    </MarketingLayout>
  );
}
