import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { COMMUNITY_CATEGORIES } from "@/lib/community/moderation";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";

type Post = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  category: string;
  status: string;
  created_at: string;
};

export default function CommunityPage() {
  const user = useAuthStore((s) => s.user);
  const [posts, setPosts] = useState<Post[]>([]);
  const [category, setCategory] = useState("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [postCategory, setPostCategory] = useState("Interview");

  async function load() {
    let q = supabase.from("community_posts").select("*").order("created_at", { ascending: false }).limit(50);
    if (category !== "all") q = q.eq("category", category);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setPosts((data as Post[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, [category]);

  async function ask() {
    if (!user?.id || !title.trim() || !body.trim()) return;
    const { error } = await supabase.from("community_posts").insert({
      user_id: user.id,
      title: title.trim(),
      body: body.trim(),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      category: postCategory,
      status: "PUBLISHED",
    });
    if (error) toast.error(error.message);
    else {
      setTitle("");
      setBody("");
      setTags("");
      void load();
    }
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Questions & Answers"
        description="Ask interview and career questions. This is Clarify’s own community, not a third-party forum."
      />
      <Card className="mb-4 space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ask a question" />
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a description" />
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags (comma separated)" />
        <Select value={postCategory} onValueChange={setPostCategory}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {COMMUNITY_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => void ask()}>Post question</Button>
      </Card>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" variant={category === "all" ? "primary" : "outline"} onClick={() => setCategory("all")}>All</Button>
        {COMMUNITY_CATEGORIES.map((c) => (
          <Button key={c} size="sm" variant={category === c ? "primary" : "outline"} onClick={() => setCategory(c)}>
            {c}
          </Button>
        ))}
      </div>
      <ul className="space-y-2">
        {posts.map((post) => (
          <li key={post.id}>
            <Link to={`/app/community/${post.id}`}>
              <Card hover className="min-w-0">
                <p className="font-medium break-words">{post.title}</p>
                <p className="text-xs text-muted-foreground">{post.category} · {post.status} · {(post.tags ?? []).join(", ")}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
