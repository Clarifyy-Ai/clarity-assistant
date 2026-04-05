import { Link } from "react-router-dom";
import { Calendar, Tag, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { MarketingLayout } from "@/components/layout/MarketingLayout";

interface BlogPostMeta {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  category: string;
  author: string;
  readTime: string;
}

const BLOG_POSTS: BlogPostMeta[] = [
  {
    slug: "how-to-use-star-method",
    title: "Mastering the STAR Method: A Complete Guide",
    excerpt: "Learn how to structure your behavioral interview answers using the Situation, Task, Action, Result framework to make a lasting impression.",
    date: "2026-03-15",
    category: "Interview Tips",
    author: "Clarify AI Team",
    readTime: "6 min read",
  },
  {
    slug: "ai-interview-prep-2026",
    title: "How AI Is Changing Interview Preparation in 2026",
    excerpt: "From real-time coaching to intelligent mock sessions, discover how AI tools are reshaping how candidates prepare for technical and behavioral interviews.",
    date: "2026-03-10",
    category: "Industry",
    author: "Clarify AI Team",
    readTime: "8 min read",
  },
  {
    slug: "system-design-interview-guide",
    title: "System Design Interviews: What Top Companies Actually Look For",
    excerpt: "A breakdown of the evaluation criteria used by FAANG companies for system design rounds, with tips on how to structure your approach.",
    date: "2026-03-05",
    category: "Technical",
    author: "Clarify AI Team",
    readTime: "10 min read",
  },
  {
    slug: "overcoming-interview-anxiety",
    title: "5 Proven Strategies for Overcoming Interview Anxiety",
    excerpt: "Interview nerves are universal. Here are evidence-based techniques to stay calm, focused, and articulate under pressure.",
    date: "2026-02-28",
    category: "Wellness",
    author: "Clarify AI Team",
    readTime: "5 min read",
  },
  {
    slug: "behavioral-questions-product-managers",
    title: "Top 20 Behavioral Questions for Product Managers",
    excerpt: "The most commonly asked behavioral questions for PM roles at top tech companies, with tips on how to answer each one effectively.",
    date: "2026-02-20",
    category: "Interview Tips",
    author: "Clarify AI Team",
    readTime: "7 min read",
  },
  {
    slug: "mock-interview-benefits",
    title: "Why Mock Interviews Are the Most Underrated Prep Tool",
    excerpt: "Research shows that candidates who do regular mock interviews are 3x more likely to receive offers. Here's why practice sessions matter more than study sessions.",
    date: "2026-02-15",
    category: "Research",
    author: "Clarify AI Team",
    readTime: "5 min read",
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  "Interview Tips": "text-blue-400 bg-blue-500/10 border-blue-500/20",
  "Industry": "text-violet-400 bg-violet-500/10 border-violet-500/20",
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
  return (
    <MarketingLayout>
      <section className="pt-20 sm:pt-28 pb-14 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Blog</h1>
            <p className="mt-4 text-sm md:text-base text-muted-foreground">Insights, guides, and tips to help you ace every interview</p>
          </motion.div>
        </div>
      </section>

      <section className="pb-24 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-5">
          {BLOG_POSTS.map((post, i) => (
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
                  <span className="text-[11px] text-muted-foreground/70">{post.readTime}</span>
                </div>

                <h2 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">{post.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1">{post.excerpt}</p>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                    <Calendar className="w-3 h-3" /> {formatDate(post.date)}
                  </div>
                  <span className="flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    Read more <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}
