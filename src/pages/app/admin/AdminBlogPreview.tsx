import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { supabase } from "@/lib/supabase/client";
import { toAdminUserMessage } from "@/lib/admin/adminErrors";

type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  author: string;
  published: boolean;
  read_time: string | null;
};

export default function AdminBlogPreview() {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const { data, error: err } = await supabase
        .from("blog_posts")
        .select("id,slug,title,excerpt,content,category,author,published,read_time")
        .eq("id", id)
        .maybeSingle();
      if (err) {
        setError(toAdminUserMessage(err, undefined, "AdminBlogPreview.load"));
        return;
      }
      setPost(data as BlogPost | null);
    })();
  }, [id]);

  if (error) {
    return (
      <div className="p-6">
        <InlineErrorRetry message={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (!post) {
    return <p className="p-6 text-sm text-muted-foreground">Loading preview…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Admin preview · {post.published ? "published" : "draft"}
        </p>
        <Link
          to="/app/admin/blog"
          className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs hover:bg-secondary"
        >
          Back to CMS
        </Link>
      </div>
      <Card className="p-6 space-y-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {post.category} · {post.author} · {post.read_time ?? "—"}
        </p>
        <h1 className="text-2xl font-semibold">{post.title}</h1>
        <p className="text-sm text-muted-foreground">{post.excerpt}</p>
        <pre className="whitespace-pre-wrap text-sm">{post.content}</pre>
      </Card>
    </div>
  );
}
