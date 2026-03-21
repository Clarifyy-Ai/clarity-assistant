import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { MarketingLayout } from "@/components/layout/MarketingLayout";

interface Article {
  id: string;
  q: string;
  a: string;
  category: string;
  related: string[];
}

const ARTICLES: Article[] = [
  { id: "gs-1", q: "What is Clarify AI?", a: "Clarify AI is an AI-powered interview preparation platform that provides real-time coaching during live interviews, full mock simulations with analytics, and a suite of prep tools to help you land your dream job.\n\nThe platform combines three core capabilities:\n\n1. **Live Interview Assistant** — Real-time AI suggestions streamed through an invisible overlay during actual interviews\n2. **Mock Engine** — Full simulation interviews with AI scoring, filler-word tracking, and detailed performance analytics\n3. **Prep Lab** — Tools including STAR builder, answer rephraser, gap analysis, company research, and coding hints\n\nAll powered by multiple AI models (GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro) with smart routing to pick the best model for each task.", category: "Getting Started", related: ["gs-2", "gs-3", "gs-4"] },
  { id: "gs-2", q: "How do I create an account?", a: "Creating an account takes less than a minute:\n\n1. Visit the Clarify AI homepage and click **Get started free**\n2. Enter your email and create a password, or sign in with Google or GitHub\n3. Verify your email address\n4. Complete the quick onboarding flow (role, experience, target companies)\n\nNo credit card is required. You'll start on the Free plan with 20 credits per month.", category: "Getting Started", related: ["gs-1", "gs-3"] },
  { id: "gs-3", q: "What happens after I sign up?", a: "After signing up, you'll go through a 5-step onboarding flow:\n\n1. **Set your role** — Choose your current job function (software engineer, product manager, etc.)\n2. **Experience level** — Select your seniority (intern, junior, mid, senior, lead, principal)\n3. **Target companies** — Add companies you're interviewing with for personalized prep\n4. **Upload resume** — Optionally upload your resume for AI gap analysis\n5. **First session** — Start your first mock interview or explore the prep lab\n\nThe platform personalizes everything based on your profile.", category: "Getting Started", related: ["gs-1", "gs-2", "gs-4"] },
  { id: "gs-4", q: "Is there a free plan?", a: "Yes! The Free plan includes:\n\n- **20 credits** per month\n- **3 live interview sessions** per month\n- **5 mock sessions** per month\n- **10 answer bank** entries\n- **5 STAR builder** uses\n\nNo credit card required. Upgrade anytime to access company research, stealth overlay, audio analysis, and more.", category: "Getting Started", related: ["bi-1", "bi-2"] },
  { id: "li-1", q: "How does the live interview assistant work?", a: "The live interview assistant works in three steps:\n\n1. **Audio capture** — Your microphone picks up the interviewer's questions\n2. **AI processing** — The question is sent to our AI models for analysis\n3. **Overlay display** — Suggested answers, talking points, and hints appear on your invisible overlay\n\nThe entire process takes under 1 second. The overlay uses compositor-layer separation, making it completely invisible to screen sharing tools like Zoom, Teams, and Google Meet.", category: "Live Interview", related: ["li-2", "li-3"] },
  { id: "li-2", q: "Is the overlay really invisible?", a: "Yes. The stealth overlay uses a technology called compositor-layer separation. This means the overlay content exists on a separate rendering layer that sits above your screen content but below the screen capture layer.\n\nThis makes it invisible to:\n- Zoom screen sharing\n- Microsoft Teams\n- Google Meet\n- Any screen recording software\n- Screenshot tools\n\nThe overlay only appears on your physical monitor.", category: "Live Interview", related: ["li-1", "li-3"] },
  { id: "li-3", q: "What AI models are used?", a: "Clarify AI supports three leading AI models:\n\n- **GPT-4o** (OpenAI) — Fast and versatile, great for most question types\n- **Claude 3.5 Sonnet** (Anthropic) — Excellent reasoning and nuanced behavioral answers\n- **Gemini 1.5 Pro** (Google) — Strong at technical and analytical tasks\n\nYou can set a preferred model in Settings, or enable **Smart Model Routing** to automatically select the best model based on the question type and complexity.", category: "Live Interview", related: ["li-1", "ac-2"] },
  { id: "li-4", q: "How many credits does a live session cost?", a: "Each hint during a live session costs **1 credit**. The total cost depends on how many hints you request.\n\nTypically, a 30-minute interview uses 5-15 credits depending on how frequently you request assistance.", category: "Live Interview", related: ["bi-1", "bi-2"] },
  { id: "mp-1", q: "What types of mock interviews are available?", a: "We offer four types of mock interview sessions:\n\n1. **Behavioral** — STAR-method questions about leadership, teamwork, conflict resolution\n2. **Technical** — Coding and algorithm questions with hints and solution breakdowns\n3. **System Design** — Architecture and scalability discussion questions\n4. **Role-Specific** — Questions tailored to your specific target role and industry\n\nEach session can be configured with Easy, Medium, or Hard difficulty and 15-60 minute durations.", category: "Mock Practice", related: ["mp-2", "mp-3"] },
  { id: "mp-2", q: "Can I practice with others?", a: "Yes! **Practice Rooms** allow collaborative mock interviews:\n\n- Create a room with a name and max participant count\n- Share the room link with peers\n- Practice together with shared scorecards\n- Get real-time AI coaching for every participant\n\nPractice Rooms are available on all plans.", category: "Mock Practice", related: ["mp-1", "mp-3"] },
  { id: "mp-3", q: "How does the scoring work?", a: "After each mock session, you receive a detailed scorecard covering:\n\n- **Clarity** — How clear and concise your answers were\n- **Structure** — STAR method usage and logical flow\n- **Specificity** — Use of concrete examples and data\n- **Relevance** — How well answers addressed the question\n- **Confidence** — Speaking pace, filler words, and delivery\n\nScores are tracked over time in your Analytics dashboard for trend analysis.", category: "Mock Practice", related: ["mp-1"] },
  { id: "bi-1", q: "How do credits work?", a: "Credits are the currency for AI features. Each action has a set cost:\n\n| Action | Cost |\n|--------|------|\n| Live hint | 1 credit |\n| Mock question | 1 credit |\n| STAR polish | 1 credit |\n| Scorecard generation | 2 credits |\n| Company brief | 3 credits |\n| Gap analysis | 3 credits |\n\nCredits refresh monthly based on your plan tier.", category: "Billing & Credits", related: ["bi-2", "bi-4"] },
  { id: "bi-2", q: "Can I buy extra credits?", a: "Yes! Credit packs are available:\n\n- **50 credits** — $4.99\n- **150 credits** — $11.99\n- **500 credits** — $29.99\n\nPurchased credits never expire, unlike monthly plan credits.", category: "Billing & Credits", related: ["bi-1", "bi-3"] },
  { id: "bi-3", q: "How do I cancel my subscription?", a: "To cancel:\n\n1. Go to **Settings > Billing**\n2. Click **Cancel subscription**\n3. Confirm cancellation\n\nYour plan remains active until the end of your current billing period. You won't be charged again, and you can resume anytime before the period ends.", category: "Billing & Credits", related: ["bi-1", "bi-4"] },
  { id: "bi-4", q: "Do unused credits roll over?", a: "**Monthly plan credits** reset at the start of each billing cycle and do not roll over.\n\n**Purchased credit packs** do not expire and carry forward indefinitely until used.", category: "Billing & Credits", related: ["bi-1", "bi-2"] },
  { id: "ac-1", q: "How do I change my password?", a: "To change your password:\n\n1. Go to **Settings > Security**\n2. Enter your current password\n3. Enter your new password (minimum 8 characters)\n4. Confirm and click **Update Password**\n\nIf you forgot your password, use the 'Forgot password' link on the login page.", category: "Account & Security", related: ["ac-2", "ac-3"] },
  { id: "ac-2", q: "Can I use my own API keys?", a: "Yes! **Bring Your Own Key (BYOK)** is available on all paid plans.\n\nYou can add API keys for:\n- OpenAI\n- Anthropic\n- Google AI\n\nWhen using your own keys, AI calls are billed directly to your provider account instead of using Clarify credits. Keys are encrypted and stored securely.\n\nGo to **Settings > API Keys** to configure.", category: "Account & Security", related: ["li-3", "ac-1"] },
  { id: "ac-3", q: "How do I delete my account?", a: "To delete your account:\n\n1. Go to **Settings > Danger Zone**\n2. Click **Delete Account**\n3. Type your email to confirm\n4. Click **Permanently Delete**\n\n⚠️ This permanently removes all your data, sessions, answers, and documents. This action cannot be undone.\n\nIf you have an active subscription, it will be canceled immediately.", category: "Account & Security", related: ["ac-1", "bi-3"] },
];

export default function HelpArticle() {
  const { slug } = useParams<{ slug: string }>();
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
            <div className="prose dark:prose-invert prose-sm max-w-none text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {article.a}
            </div>
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
