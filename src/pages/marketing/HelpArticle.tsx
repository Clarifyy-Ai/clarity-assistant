import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { MarketingLayout } from "@/components/layout/MarketingLayout";

interface Article {
  id: string;
  q: string;
  a: string;
  category: string;
  categorySlug: string;
  related: string[];
}

const ARTICLES: Article[] = [
  { id: "gs-1", q: "What is Clarify AI?", categorySlug: "getting-started", a: "Clarify AI is an AI-powered interview **preparation** platform. It provides a live practice coach, full mock simulations with analytics, and a suite of prep tools to help you land your dream job.\n\nThe platform combines three core capabilities:\n\n1. **Live Practice Coach** — Real-time AI suggestions during rehearsal sessions, shown in an on-screen prep overlay\n2. **Mock Engine** — Full simulation interviews with AI scoring, filler-word tracking, and detailed performance analytics\n3. **Prep Lab** — Tools including STAR builder, answer rephraser, gap analysis, company research, and coding hints\n\nAt launch, Clarify AI is powered by Google Gemini 2.0 Flash for low-latency hints, answers, and debriefs.\n\nClarify AI is for practice only. Using AI assistance covertly during a real interview violates most employer and assessment policies.", category: "Getting Started", related: ["gs-2", "gs-3", "gs-4"] },
  { id: "gs-2", q: "How do I create an account?", categorySlug: "getting-started", a: "Creating an account takes less than a minute:\n\n1. Visit the Clarify AI homepage and click **Get started free**\n2. Enter your email and create a password, or sign in with Google\n3. Verify your email address\n4. Complete the quick onboarding flow (role, experience, target companies)\n\nNo credit card is required. You'll start on the Free plan with 200 credits per month.", category: "Getting Started", related: ["gs-1", "gs-3"] },
  { id: "gs-3", q: "What happens after I sign up?", categorySlug: "getting-started", a: "After signing up, you'll go through a short onboarding flow:\n\n1. **Set your role** — Choose your current job function (software engineer, product manager, etc.)\n2. **Experience level** — Select your seniority (intern, junior, mid, senior, lead, principal)\n3. **Target companies** — Add companies you're interviewing with for personalized prep\n4. **Upload resume** — Optionally upload your resume for AI gap analysis\n5. **First session** — Start your first practice session or explore the prep lab\n\nThe platform personalizes everything based on your profile.", category: "Getting Started", related: ["gs-1", "gs-2", "gs-4"] },
  { id: "gs-4", q: "Is there a free plan?", categorySlug: "getting-started", a: "Yes. The Free plan includes:\n\n- **200 credits** per month\n- Practice sessions with the live AI coach\n- STAR builder and answer bank\n- Resume + JD gap analysis\n\nNo credit card required. Upgrade to **Pro** ($29/mo, 2,000 credits) or **Enterprise** ($79/mo, unlimited) anytime.", category: "Getting Started", related: ["bi-1", "bi-2"] },
  { id: "li-1", q: "How does the live practice coach work?", categorySlug: "live-interview", a: "The live practice coach works in three steps:\n\n1. **Audio capture** — Your microphone (and optionally system audio in Chromium browsers) picks up the question\n2. **AI processing** — The question is sent to Google Gemini 2.0 Flash for analysis\n3. **Overlay display** — Suggested talking points, structure hints, and follow-ups appear in your on-screen prep overlay\n\nThe whole loop takes under a second. The overlay is a normal on-screen window and is visible to screen-sharing tools — it is not designed to be hidden during real interviews.", category: "Live Interview", related: ["li-2", "li-3"] },
  { id: "li-2", q: "Can I use Live Co-Pilot during a real interview?", categorySlug: "live-interview", a: "**No.** Live Co-Pilot is built strictly for interview rehearsal with an AI coach.\n\nUsing AI assistance covertly during a live interview:\n\n- Violates most employer and assessment policies\n- May breach the terms of platforms like Zoom, Teams, Google Meet, HackerRank, and CoderPad\n- Can result in offer rescissions or disciplinary action\n\nThe Clarify AI overlay is a normal on-screen window and is visible to screen-sharing tools by design.", category: "Live Interview", related: ["li-1", "li-3"] },
  { id: "li-3", q: "What AI model is used?", categorySlug: "live-interview", a: "At launch, Clarify AI is powered by **Google Gemini 2.0 Flash** for hints, STAR answer drafting, and debriefs.\n\nGemini 2.0 Flash gives us the latency we need for sub-second hint streaming while keeping costs predictable. Additional providers (multi-model routing, BYOK) are on the roadmap but not available in v1.", category: "Live Interview", related: ["li-1", "ac-2"] },
  { id: "li-4", q: "How many credits does a practice session cost?", categorySlug: "live-interview", a: "Each requested hint costs **1 credit**. Each generated STAR-format answer costs **2 credits**. The end-of-session debrief is **5 credits**.\n\nA typical 30-minute practice session uses 5-15 credits depending on how often you request assistance.", category: "Live Interview", related: ["bi-1", "bi-2"] },
  { id: "mp-1", q: "What types of mock interviews are available?", categorySlug: "mock-practice", a: "We offer four types of mock interview sessions:\n\n1. **Behavioral** — STAR-method questions about leadership, teamwork, conflict resolution\n2. **Technical** — Coding and algorithm questions with hints and solution breakdowns\n3. **System Design** — Architecture and scalability discussion questions\n4. **Role-Specific** — Questions tailored to your specific target role and industry\n\nEach session can be configured with Easy, Medium, or Hard difficulty and 15-60 minute durations.", category: "Mock Practice", related: ["mp-2", "mp-3"] },
  { id: "mp-2", q: "Can I practice with others?", categorySlug: "mock-practice", a: "Yes! **Practice Rooms** allow collaborative mock interviews:\n\n- Create a room with a name and max participant count\n- Share the room link with peers\n- Practice together with shared scorecards\n- Get real-time AI coaching for every participant\n\nPractice Rooms are available on all plans.", category: "Mock Practice", related: ["mp-1", "mp-3"] },
  { id: "mp-3", q: "How does the scoring work?", categorySlug: "mock-practice", a: "After each mock session, you receive a detailed scorecard covering:\n\n- **Clarity** — How clear and concise your answers were\n- **Structure** — STAR method usage and logical flow\n- **Specificity** — Use of concrete examples and data\n- **Relevance** — How well answers addressed the question\n- **Confidence** — Speaking pace, filler words, and delivery\n\nScores are tracked over time in your Analytics dashboard for trend analysis.", category: "Mock Practice", related: ["mp-1"] },
  { id: "bi-1", q: "How do credits work?", categorySlug: "billing", a: "Credits are the currency for AI features. Each action has a set cost:\n\n- Live hint: 1 credit\n- Mock question: 1 credit\n- STAR polish: 1 credit\n- Scorecard generation: 2 credits\n- Company brief: 3 credits\n- Gap analysis: 3 credits\n\nCredits refresh monthly based on your plan tier.", category: "Billing & Credits", related: ["bi-2", "bi-4"] },
  { id: "bi-2", q: "Can I buy extra credits?", categorySlug: "billing", a: "À la carte credit packs are not available at launch. To increase your monthly allowance, upgrade to **Pro** (2,000 credits/month) or **Enterprise** (unlimited credits) from **Settings > Billing**.", category: "Billing & Credits", related: ["bi-1", "bi-3"] },
  { id: "bi-3", q: "How do I cancel my subscription?", categorySlug: "billing", a: "To cancel:\n\n1. Go to **Settings > Billing**\n2. Click **Cancel subscription**\n3. Confirm cancellation\n\nYour plan remains active until the end of your current billing period. You won't be charged again, and you can resume anytime before the period ends.", category: "Billing & Credits", related: ["bi-1", "bi-4"] },
  { id: "bi-4", q: "Do unused credits roll over?", categorySlug: "billing", a: "Monthly plan credits reset at the start of each billing cycle and do not roll over.", category: "Billing & Credits", related: ["bi-1", "bi-2"] },
  { id: "ac-1", q: "How do I change my password?", categorySlug: "account", a: "To change your password:\n\n1. Go to **Settings > Security**\n2. Enter your current password\n3. Enter your new password (minimum 8 characters)\n4. Confirm and click **Update Password**\n\nIf you forgot your password, use the 'Forgot password' link on the login page.", category: "Account & Security", related: ["ac-2", "ac-3"] },
  { id: "ac-2", q: "Can I use my own AI API keys?", categorySlug: "account", a: "**Bring Your Own Key (BYOK)** is on our roadmap and not available at launch.\n\nAll AI calls today go through Clarify AI's managed Google Gemini connection and count against your monthly credit balance. We'll announce BYOK availability — with proper server-side key encryption — when it ships.", category: "Account & Security", related: ["li-3", "ac-1"] },
  { id: "ac-3", q: "How do I delete my account?", categorySlug: "account", a: "To delete your account:\n\n1. Go to **Settings > Danger Zone**\n2. Click **Delete Account**\n3. Type your email to confirm\n4. Click **Permanently Delete**\n\nThis permanently removes all your data, sessions, answers, and documents. This action cannot be undone.\n\nIf you have an active subscription, it will be canceled immediately.", category: "Account & Security", related: ["ac-1", "bi-3"] },
];

const CATEGORY_SLUGS: Record<string, { title: string; ids: string[] }> = {
  "getting-started": { title: "Getting Started", ids: ["gs-1", "gs-2", "gs-3", "gs-4"] },
  "live-interview":  { title: "Live Interview",   ids: ["li-1", "li-2", "li-3", "li-4"] },
  "mock-practice":   { title: "Mock Practice",    ids: ["mp-1", "mp-2", "mp-3"] },
  "billing":         { title: "Billing & Credits", ids: ["bi-1", "bi-2", "bi-3", "bi-4"] },
  "account":         { title: "Account & Security", ids: ["ac-1", "ac-2", "ac-3"] },
};

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-sm font-bold text-foreground mt-5 mb-1.5">
          {renderInline(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="text-base font-bold text-foreground mt-6 mb-2">
          {renderInline(line.slice(3))}
        </h2>
      );
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

export default function HelpArticle() {
  const { slug } = useParams<{ slug: string }>();

  const categoryData = slug ? CATEGORY_SLUGS[slug] : null;
  if (categoryData) {
    const categoryArticles = categoryData.ids
      .map((id) => ARTICLES.find((a) => a.id === id))
      .filter(Boolean) as Article[];

    return (
      <MarketingLayout>
        <section className="pt-32 pb-20 px-6">
          <div className="max-w-2xl mx-auto">
            <Link to="/help" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
              <ArrowLeft className="w-4 h-4" /> Back to Help Center
            </Link>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <h1 className="text-3xl font-bold mb-8">{categoryData.title}</h1>
              <div className="space-y-8">
                {categoryArticles.map((article) => (
                  <div key={article.id} className="border-b border-border pb-8 last:border-0">
                    <h2 className="text-lg font-semibold text-foreground mb-4">{article.q}</h2>
                    <div>{renderMarkdown(article.a)}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      </MarketingLayout>
    );
  }

  const article = ARTICLES.find((a) => a.id === slug);

  if (!article) {
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

  const relatedArticles = article.related
    .map((id) => ARTICLES.find((a) => a.id === id))
    .filter(Boolean) as Article[];

  return (
    <MarketingLayout>
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-2xl mx-auto">
          <Link to="/help" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to Help Center
          </Link>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="text-xs text-primary font-medium">{article.category}</span>
            <h1 className="text-3xl font-bold mt-2 mb-6">{article.q}</h1>
            <div>{renderMarkdown(article.a)}</div>
          </motion.div>

          {relatedArticles.length > 0 && (
            <div className="mt-12 pt-8 border-t border-border">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Related Articles</h3>
              <div className="space-y-2">
                {relatedArticles.map((ra) => (
                  <Link
                    key={ra.id}
                    to={`/help/${ra.id}`}
                    className="block p-3 rounded-xl border border-border bg-card hover:bg-card/80 hover:border-primary/30 transition-all text-sm text-muted-foreground hover:text-foreground"
                  >
                    {ra.q}
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
