import { useParams, Link } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft, Calendar, User } from "lucide-react";
import { motion } from "framer-motion";
import { MarketingLayout } from "@/components/layout/MarketingLayout";

interface BlogPostData {
  slug: string;
  title: string;
  date: string;
  category: string;
  author: string;
  readTime: string;
  excerpt: string;
  content: string;
}

const POSTS: BlogPostData[] = [
  {
    slug: "how-to-use-star-method",
    title: "Mastering the STAR Method: A Complete Guide",
    date: "2026-03-15",
    category: "Interview Tips",
    author: "Clarify AI Team",
    readTime: "6 min read",
    excerpt: "Learn how to structure your behavioral interview answers using the Situation, Task, Action, Result framework to make a lasting impression.",
    content: `The STAR method is one of the most effective frameworks for answering behavioral interview questions. It stands for Situation, Task, Action, and Result.

## Why STAR Works

Interviewers use behavioral questions to predict future performance based on past behavior. The STAR method gives you a clear structure that ensures your answers are:

- **Specific** — Grounded in real experiences, not hypotheticals
- **Structured** — Easy for the interviewer to follow
- **Impactful** — Focused on measurable outcomes

## Breaking Down Each Component

### Situation
Set the scene. Describe the context — where you were working, what project or challenge you were facing, and any relevant background. Keep it concise (2-3 sentences).

### Task
Explain your specific responsibility. What were you accountable for? What was expected of you? This clarifies your role versus the team's.

### Action
This is the most important part. Describe the specific steps YOU took. Use "I" not "we." Be detailed about your decision-making process, the skills you used, and why you chose that approach.

### Result
Quantify the outcome whenever possible. Use metrics, percentages, or concrete improvements. Even if the result wasn't perfect, describe what you learned and how you'd approach it differently.

## Common Mistakes

1. **Being too vague** — "I helped the team improve things" doesn't tell the interviewer anything
2. **Skipping the Result** — Always close the loop with outcomes
3. **Using "we" instead of "I"** — Interviewers want to know YOUR contribution
4. **Rambling** — Keep answers to 2-3 minutes maximum

## Using Clarify AI's STAR Builder

Our STAR Builder tool helps you craft and polish STAR answers with AI assistance. Enter your raw experience, and the AI will structure it into a compelling STAR format with clear metrics and impactful language.

Try it free at clarifyai.com/signup.`,
  },
  {
    slug: "ai-interview-prep-2026",
    title: "How AI Is Changing Interview Preparation in 2026",
    date: "2026-03-10",
    category: "Industry",
    author: "Clarify AI Team",
    readTime: "8 min read",
    excerpt: "From real-time coaching to intelligent mock sessions, discover how AI tools are reshaping how candidates prepare for technical and behavioral interviews.",
    content: `The interview preparation landscape has transformed dramatically. AI-powered tools are now an essential part of every serious candidate's toolkit.

## The Evolution of Interview Prep

**Before AI:** Candidates relied on static question banks, peer practice, and expensive coaching sessions. Feedback was infrequent and subjective.

**With AI:** Real-time coaching, personalized question generation, instant feedback scoring, and adaptive practice sessions are now accessible to everyone.

## Key AI Capabilities in 2026

### Real-Time Coaching
AI assistants can now listen to live interview conversations and provide suggested answers, talking points, and follow-up ideas in under one second. This technology has become the new standard for competitive candidates.

### Intelligent Mock Sessions
AI-powered mock interviews go beyond scripted questions. They adapt to your responses, probe deeper on weak areas, and generate detailed scorecards analyzing everything from content quality to speaking pace and filler word usage.

### Personalized Learning Paths
Modern AI prep tools analyze your performance across sessions to identify patterns. They create customized practice plans focusing on your specific weak spots — whether that's system design communication, behavioral story structure, or technical explanation clarity.

### Multi-Model Architecture
Leading platforms now use multiple AI models (GPT-4o, Claude, Gemini) with smart routing to pick the best model for each question type. This delivers faster, more accurate responses than single-model systems.

## The Impact on Hiring

Studies show that candidates using AI prep tools are:
- 3x more likely to advance past behavioral rounds
- 2x more likely to receive offers at target companies
- 40% more confident in their interview performance

## What This Means for You

AI interview prep isn't about cheating — it's about practicing smarter. Just like athletes use video analysis and coaches, candidates should use every available tool to prepare thoroughly.

The best approach combines AI tools with deliberate practice. Use AI for feedback and pattern recognition, but develop your own authentic stories and technical knowledge.`,
  },
  {
    slug: "system-design-interview-guide",
    title: "System Design Interviews: What Top Companies Actually Look For",
    date: "2026-03-05",
    category: "Technical",
    author: "Clarify AI Team",
    readTime: "10 min read",
    excerpt: "A breakdown of the evaluation criteria used by FAANG companies for system design rounds, with tips on how to structure your approach.",
    content: `System design interviews are often the most intimidating round for software engineers. Here's what FAANG-level companies actually evaluate.

## The Four Pillars of Evaluation

### 1. Problem Exploration
Can you ask clarifying questions? Do you identify constraints, scale requirements, and edge cases before jumping to solutions? Top candidates spend 5-10 minutes on requirements gathering.

### 2. High-Level Design
Can you sketch a clean architecture? Interviewers look for clear component separation, sensible data flow, and awareness of standard patterns (microservices, event-driven, CQRS).

### 3. Deep Dive
Can you go deep on specific components? When asked about your database choice, caching strategy, or API design, can you justify decisions with tradeoffs? This separates strong candidates from great ones.

### 4. Trade-Off Discussion
Every design decision has tradeoffs. Interviewers want to see you acknowledge them. Consistency vs availability, latency vs throughput, simplicity vs flexibility — articulate both sides.

## Common Topics

- URL shortener / paste service
- News feed / timeline
- Chat system / real-time messaging
- Rate limiter
- Distributed cache
- Video streaming platform
- Search autocomplete

## Tips for Success

1. **Use a framework** — Start with requirements, then high-level, then deep dive
2. **Think out loud** — The process matters more than the final answer
3. **Draw as you go** — Visual communication shows clarity of thought
4. **Know your numbers** — Estimation skills matter (QPS, storage, bandwidth)
5. **Practice regularly** — System design skills decay without practice

## How Clarify AI Helps

Our system design mock sessions generate realistic design problems tailored to your target companies. The AI evaluates your approach across all four pillars and provides actionable feedback on areas for improvement.`,
  },
  {
    slug: "overcoming-interview-anxiety",
    title: "5 Proven Strategies for Overcoming Interview Anxiety",
    date: "2026-02-28",
    category: "Wellness",
    author: "Clarify AI Team",
    readTime: "5 min read",
    excerpt: "Interview nerves are universal. Here are evidence-based techniques to stay calm, focused, and articulate under pressure.",
    content: `Interview anxiety affects nearly everyone. Research shows that up to 92% of candidates experience some form of interview nervousness. Here are five evidence-based strategies to manage it.

## 1. Preparation Reduces Uncertainty

Anxiety thrives on uncertainty. The more prepared you are, the less your brain perceives the interview as a threat. This means:
- Researching the company thoroughly
- Practicing answers to common questions
- Doing mock interviews to simulate the real experience

Studies show that candidates who complete at least 5 mock interviews report 60% lower anxiety levels.

## 2. The Power Pose (Still Works)

Amy Cuddy's research on body language shows that holding an expansive posture for 2 minutes before a high-stakes situation can reduce cortisol and increase testosterone. Before your interview:
- Stand with feet shoulder-width apart
- Hands on hips or arms raised
- Hold for 2 minutes

## 3. Reframe Anxiety as Excitement

Harvard research found that telling yourself "I am excited" before a stressful event improves performance more than trying to calm down. Anxiety and excitement have the same physiological signature — the difference is interpretation.

## 4. The 4-7-8 Breathing Technique

This technique activates the parasympathetic nervous system:
- Breathe in for 4 seconds
- Hold for 7 seconds
- Exhale slowly for 8 seconds
- Repeat 3-4 times

Do this in the waiting room or before joining a video call.

## 5. Progressive Exposure

Start with low-stakes practice and gradually increase the intensity:
1. Practice answers alone (recording yourself)
2. Practice with a friend
3. Do AI mock interviews
4. Do practice room sessions with strangers
5. Real interviews

Each step builds confidence and reduces the anxiety response.

## The Bottom Line

Some nervousness is actually beneficial — it sharpens focus and keeps you alert. The goal isn't to eliminate anxiety but to manage it so it doesn't interfere with your performance.`,
  },
  {
    slug: "behavioral-questions-product-managers",
    title: "Top 20 Behavioral Questions for Product Managers",
    date: "2026-02-20",
    category: "Interview Tips",
    author: "Clarify AI Team",
    readTime: "7 min read",
    excerpt: "The most commonly asked behavioral questions for PM roles at top tech companies, with tips on how to answer each one effectively.",
    content: `Product management interviews have their own flavor of behavioral questions. Here are the 20 most commonly asked questions across top tech companies, organized by theme.

## Leadership & Influence

1. Tell me about a time you influenced a team to change direction without direct authority.
2. Describe a situation where you had to make a difficult prioritization decision.
3. How have you handled disagreement with an engineering lead about technical approach?
4. Tell me about a time you drove alignment across multiple stakeholders.

## Customer Obsession

5. Describe a time you discovered an unmet customer need.
6. Tell me about a product decision you made based on customer data.
7. How have you balanced customer requests with product vision?
8. Describe a time you had to say "no" to a customer or stakeholder.

## Strategy & Metrics

9. Tell me about a time you defined success metrics for a new feature.
10. Describe a situation where metrics told a different story than you expected.
11. How have you used data to pivot a product strategy?
12. Tell me about a time you had to make a decision with incomplete data.

## Execution & Delivery

13. Describe a product launch that didn't go as planned.
14. Tell me about a time you had to scope down a project to meet a deadline.
15. How have you managed technical debt while shipping new features?
16. Describe your approach to managing competing priorities across teams.

## Growth & Learning

17. Tell me about your biggest product failure and what you learned.
18. Describe a time you received critical feedback and how you acted on it.
19. How have you stayed current with industry trends and applied them?
20. Tell me about a time you mentored someone on your team.

## Tips for PM Behavioral Answers

- **Always use STAR format** — Structure matters for credibility
- **Quantify impact** — Revenue, users, engagement metrics
- **Show cross-functional work** — PMs succeed through others
- **Demonstrate learning** — Growth mindset signals are strong
- **Be genuine** — Rehearsed but authentic beats polished but hollow

Use Clarify AI's mock sessions to practice these questions with AI feedback on structure, specificity, and impact of your answers.`,
  },
  {
    slug: "mock-interview-benefits",
    title: "Why Mock Interviews Are the Most Underrated Prep Tool",
    date: "2026-02-15",
    category: "Research",
    author: "Clarify AI Team",
    readTime: "5 min read",
    excerpt: "Research shows that candidates who do regular mock interviews are 3x more likely to receive offers. Here's why practice sessions matter more than study sessions.",
    content: `Most candidates spend 80% of their prep time reading and only 20% practicing. Research suggests the optimal ratio should be reversed.

## The Science of Practice

Cognitive psychology research on "testing effect" shows that active recall (being tested) is significantly more effective for learning than passive review (reading). Mock interviews are the ultimate form of active recall for interview prep.

## Key Benefits of Mock Interviews

### 1. Reduced Anxiety
Each mock interview you complete reduces the novelty and uncertainty of the real thing. After 5-10 practice sessions, candidates report significantly lower anxiety levels.

### 2. Improved Articulation
Thinking about an answer and speaking an answer are fundamentally different cognitive tasks. Mock interviews train the speaking pathway, which is what actually matters in an interview.

### 3. Time Management
Without practice, candidates often ramble or give incomplete answers. Mock interviews help you calibrate your response length to the 2-3 minute sweet spot.

### 4. Feedback Loops
You can't improve what you can't measure. Mock interviews with AI scoring provide objective feedback on structure, specificity, confidence, and communication clarity.

### 5. Pattern Recognition
After several mock sessions, you'll notice patterns in your strengths and weaknesses. Maybe you're strong on leadership stories but weak on failure examples. This helps you target your remaining prep time efficiently.

## How Many Mock Interviews Should You Do?

Research and our platform data suggest:
- **Minimum:** 5 mock sessions before any real interview
- **Optimal:** 10-15 sessions across different question types
- **Marginal returns decrease** after ~20 sessions

## Making the Most of Each Session

1. Treat it like a real interview (dress code, environment)
2. Don't pause or restart — push through mistakes
3. Review your scorecard immediately after
4. Identify one specific area to improve for next session
5. Space sessions over days, not hours

Start practicing with Clarify AI's mock engine — your first 5 sessions are free.`,
  },
];

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-base font-bold text-foreground mt-6 mb-2">
          {renderInline(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="text-lg font-bold text-foreground mt-8 mb-3">
          {renderInline(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} className="text-xl font-bold text-foreground mt-8 mb-3">
          {renderInline(line.slice(2))}
        </h1>
      );
    } else if (line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal list-inside space-y-1 my-3 text-muted-foreground text-sm">
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
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
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-sm text-muted-foreground leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }
    i++;
  }

  return elements;
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

function useBlogPostMeta(post: BlogPostData | undefined) {
  useEffect(() => {
    if (!post) return;

    const title = `${post.title} | Clarify AI Blog`;
    const description = post.excerpt;
    const url = `${window.location.origin}/blog/${post.slug}`;

    document.title = title;

    function setMeta(name: string, content: string, attr = "name") {
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    }

    setMeta("description", description);
    setMeta("og:title", title, "property");
    setMeta("og:description", description, "property");
    setMeta("og:url", url, "property");
    setMeta("og:type", "article", "property");
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", title);
    setMeta("twitter:description", description);

    return () => {
      document.title = "Clarify AI — Interview Prep Powered by AI";
    };
  }, [post]);
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = POSTS.find((p) => p.slug === slug);

  useBlogPostMeta(post);

  if (!post) {
    return (
      <MarketingLayout>
        <div className="pt-32 pb-24 flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Post not found</p>
            <Link to="/blog" className="text-primary hover:underline text-sm">Back to Blog</Link>
          </div>
        </div>
      </MarketingLayout>
    );
  }

  return (
    <MarketingLayout>
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-2xl mx-auto">
          <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to Blog
          </Link>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="text-xs text-primary font-medium">{post.category}</span>
            <h1 className="text-3xl sm:text-4xl font-bold mt-2 mb-4">{post.title}</h1>

            <div className="flex items-center gap-4 text-xs text-muted-foreground/70 mb-8">
              <span className="flex items-center gap-1"><User className="w-3 h-3" /> {post.author}</span>
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(post.date)}</span>
              <span>{post.readTime}</span>
            </div>

            <div className="max-w-none">
              {renderMarkdown(post.content)}
            </div>
          </motion.div>

          <div className="mt-12 pt-8 border-t border-border text-center">
            <h3 className="text-lg font-bold mb-2">Ready to start practicing?</h3>
            <p className="text-sm text-muted-foreground mb-4">Get your first 5 mock sessions free. No credit card required.</p>
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Get started free
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
