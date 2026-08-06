import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Calendar, User } from "lucide-react";
import { LazyMotion, domAnimation, m } from "framer-motion";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { usePageMeta } from "@/hooks/usePageMeta";
import { supabase } from "@/integrations/supabase/client";

interface BlogPostData {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  author: string;
  read_time: string | null;
  published_at: string;
  cover_image_url: string | null;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-base font-bold text-foreground mt-6 mb-2">{renderInline(line.slice(4))}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-lg font-bold text-foreground mt-8 mb-3">{renderInline(line.slice(3))}</h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-xl font-bold text-foreground mt-8 mb-3">{renderInline(line.slice(2))}</h1>);
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

function BlogPostNotFound() {
  usePageMeta({
    title: "Post not found | Clarify AI Blog",
    description: "This blog post could not be found.",
    noIndex: true,
  });

  return (
    <MarketingLayout>
      <div className="flex min-h-[60vh] items-center justify-center px-6 pt-16 pb-24">
        <div className="text-center max-w-md">
          <h1 className="mb-4 text-3xl md:text-4xl font-bold text-foreground">404</h1>
          <p className="mb-4 text-xl text-muted-foreground">This post does not exist</p>
          <Link to="/blog" className="text-primary underline hover:text-primary/90 text-sm">
            Back to Blog
          </Link>
        </div>
      </div>
    </MarketingLayout>
  );
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPostData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from("blog_posts")
        .select("slug, title, excerpt, content, category, author, read_time, published_at, cover_image_url")
        .eq("slug", slug)
        .eq("published", true)
        .maybeSingle();
      if (cancelled) return;
      setPost((data as BlogPostData) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const canonical = post ? `/blog/${post.slug}` : undefined;
  const jsonLd = post
    ? {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.excerpt,
        datePublished: post.published_at,
        author: { "@type": "Organization", name: post.author },
        publisher: { "@type": "Organization", name: "Clarify AI" },
      }
    : undefined;

  usePageMeta({
    title: post ? `${post.title} | Clarify AI Blog` : "Blog | Clarify AI",
    description: post?.excerpt ?? "Interview prep insights from Clarify AI.",
    canonical,
    ogType: "article",
    ogImage: post?.cover_image_url ?? undefined,
    jsonLd,
  });

  if (loading) {
    return (
      <MarketingLayout>
        <section className="pt-16 pb-20 px-6">
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="h-4 w-24 bg-secondary/60 rounded animate-pulse" />
            <div className="h-10 w-3/4 bg-secondary/60 rounded animate-pulse" />
            <div className="h-4 w-1/2 bg-secondary/60 rounded animate-pulse" />
            <div className="h-64 bg-secondary/40 rounded animate-pulse mt-6" />
          </div>
        </section>
      </MarketingLayout>
    );
  }

  if (!post) {
    return <BlogPostNotFound />;
  }

  return (
    <MarketingLayout>
      <LazyMotion features={domAnimation} strict>
      <section className="pt-16 pb-20 px-6">
        <div className="max-w-2xl mx-auto">
          <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to Blog
          </Link>

          <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="text-xs text-primary font-medium">{post.category}</span>
            <h1 className="text-3xl md:text-4xl font-bold mt-2 mb-4">{post.title}</h1>

            <div className="flex items-center gap-4 text-xs text-muted-foreground/70 mb-8">
              <span className="flex items-center gap-1"><User className="w-3 h-3" /> {post.author}</span>
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(post.published_at)}</span>
              {post.read_time && <span>{post.read_time}</span>}
            </div>

            <div className="max-w-none">
              {renderMarkdown(post.content)}
            </div>
          </m.div>

          <div className="mt-12 pt-8 border-t border-border text-center">
            <h3 className="text-lg font-bold mb-2">Ready to start practicing?</h3>
            <p className="text-sm text-muted-foreground mb-4">Start free with 50 credits per month. No credit card required.</p>
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Get started free
            </Link>
          </div>
        </div>
      </section>
      </LazyMotion>
    </MarketingLayout>
  );
}
