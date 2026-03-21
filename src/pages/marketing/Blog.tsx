import { Link } from "react-router-dom";
import { Calendar, Tag, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

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
    <div className="min-h-screen bg-[#07070d] text-white overflow-x-hidden">
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-[#07070d]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/images/clarify-logo.png" alt="Clarify AI" className="h-8 w-auto" />
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link to="/blog" className="text-white">Blog</Link>
            <Link to="/help" className="hover:text-white transition-colors">Help</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-gray-300 hover:text-white transition-colors hidden sm:inline-block">Log in</Link>
            <Link to="/signup" className="text-sm font-semibold px-5 py-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity">Get started free</Link>
          </div>
        </div>
      </nav>

      <section className="pt-36 pb-16 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">Blog</h1>
            <p className="mt-4 text-lg text-gray-400">Insights, guides, and tips to help you ace every interview</p>
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
                className="group flex flex-col h-full p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border ${CATEGORY_COLORS[post.category] ?? "text-gray-400 bg-gray-500/10 border-gray-500/20"}`}>
                    <Tag className="w-3 h-3" /> {post.category}
                  </span>
                  <span className="text-[11px] text-gray-500">{post.readTime}</span>
                </div>

                <h2 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">{post.title}</h2>
                <p className="text-sm text-gray-400 leading-relaxed flex-1">{post.excerpt}</p>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
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

      <footer className="border-t border-white/[0.06] py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
          <span>&copy; {new Date().getFullYear()} Clarify AI. All rights reserved.</span>
          <div className="flex gap-6">
            <Link to="/pricing" className="hover:text-gray-400 transition-colors">Pricing</Link>
            <Link to="/help" className="hover:text-gray-400 transition-colors">Help</Link>
            <Link to="/shortcuts" className="hover:text-gray-400 transition-colors">Shortcuts</Link>
            <Link to="/blog" className="hover:text-gray-400 transition-colors">Blog</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
