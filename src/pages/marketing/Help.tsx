import { useState } from "react";
import { Link } from "react-router-dom";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Search, ChevronDown, ChevronUp, HelpCircle, Mail } from "lucide-react";
import { motion } from "framer-motion";
import { MarketingLayout } from "@/components/layout/MarketingLayout";

interface FaqItem {
  id: string;
  q: string;
  a: string;
}

interface FaqCategory {
  title: string;
  slug: string;
  items: FaqItem[];
}

const FAQ_DATA: FaqCategory[] = [
  {
    title: "Getting Started",
    slug: "getting-started",
    items: [
      { id: "gs-1", q: "What is Clarify AI?", a: "Clarify AI is an AI-powered interview preparation platform that provides real-time coaching during live interviews, full mock simulations with analytics, and a suite of prep tools to help you land your dream job." },
      { id: "gs-2", q: "How do I create an account?", a: "Click 'Get started free' on the homepage. You can sign up with your email or use Google/GitHub OAuth. No credit card required for the free plan." },
      { id: "gs-3", q: "What happens after I sign up?", a: "You'll go through a quick onboarding flow where you set your role, experience level, and target companies. This helps personalize your AI coaching experience." },
      { id: "gs-4", q: "Is there a free plan?", a: "Yes. The Free plan includes 200 credits per month, full access to practice sessions, the STAR builder, and the answer bank. No credit card required." },
    ],
  },
  {
    title: "Live Interview",
    slug: "live-interview",
    items: [
      { id: "li-1", q: "How does the live practice coach work?", a: "During a practice session, Clarify AI listens to your spoken answers and provides real-time suggested talking points, structure hints, and follow-up prompts in an on-screen prep overlay. It is designed for rehearsal — not for use during real interviews." },
      { id: "li-2", q: "Can I use this during a real interview?", a: "No. Live Co-Pilot is built strictly for interview practice. Using AI assistance covertly during a real interview violates most employer and assessment policies and may breach platform terms. The overlay is a normal on-screen window and is visible to screen-sharing tools." },
      { id: "li-3", q: "What AI model is used?", a: "At launch, Clarify AI is powered by Google Gemini 2.0 Flash for low-latency hints, answer drafting, and debriefs. Additional model providers are on the roadmap." },
      { id: "li-4", q: "How many credits does a practice session cost?", a: "Each requested hint costs 1 credit and each generated STAR answer costs 2 credits. Listening, transcription, and the debrief at the end of the session are included." },
    ],
  },
  {
    title: "Mock Practice",
    slug: "mock-practice",
    items: [
      { id: "mp-1", q: "What types of mock interviews are available?", a: "We offer behavioral, technical, system design, and role-specific mock sessions. Each session includes AI-generated questions, real-time feedback, and a detailed scorecard." },
      { id: "mp-2", q: "Can I practice with others?", a: "Yes! Practice Rooms allow you to create collaborative sessions where you and peers can practice together with shared scorecards and real-time coaching." },
      { id: "mp-3", q: "How does the scoring work?", a: "After each mock session, you receive a scorecard covering clarity, structure (STAR method usage), specificity, relevance, and confidence. Each area is scored and compared against your historical performance." },
    ],
  },
  {
    title: "Billing & Credits",
    slug: "billing",
    items: [
      { id: "bi-1", q: "How do credits work?", a: "Credits are the currency for AI-powered features. Each action (hint, STAR answer, debrief, company research, etc.) costs a specific number of credits. Free includes 200 credits / month, Pro includes 2,000 / month, and Enterprise is unlimited." },
      { id: "bi-2", q: "How much do paid plans cost?", a: "Pro is $29 / month for 2,000 credits and unlocks the full feature set. Enterprise is $79 / month per seat with unlimited credits and team controls. Yearly billing saves roughly two months." },
      { id: "bi-3", q: "How do I cancel my subscription?", a: "Go to Settings → Billing and click 'Cancel subscription'. Your plan stays active until the end of the current billing period; you won't be charged again." },
      { id: "bi-4", q: "Do unused credits roll over?", a: "No, monthly plan credits reset at the start of each billing cycle." },
    ],
  },
  {
    title: "Account & Security",
    slug: "account",
    items: [
      { id: "ac-1", q: "How do I change my password?", a: "Go to Settings > Security and use the change password form. You'll need to enter your current password and then your new password (minimum 8 characters)." },
      { id: "ac-2", q: "Can I use my own AI API keys?", a: "Bring-your-own-key (BYOK) is on our roadmap and not available at launch. All AI calls today use Clarify's managed Gemini connection and count against your monthly credit balance." },
      { id: "ac-3", q: "How do I delete my account?", a: "Go to Settings > Danger Zone and click 'Delete Account'. This will permanently remove all your data, sessions, and answers. This action cannot be undone." },
    ],
  },
];

export default function Help() {
  usePageMeta({
    title: "Help Center — Clarify AI",
    description: "FAQs and guides for interview prep, live coaching, mock tests, and billing.",
  });

  const [search, setSearch] = useState("");
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  function toggleItem(id: string) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const filtered = search.trim()
    ? FAQ_DATA.map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.q.toLowerCase().includes(search.toLowerCase()) ||
            item.a.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter((cat) => cat.items.length > 0)
    : FAQ_DATA;

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
          {filtered.map((category) => (
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
                  const isOpen = openItems.has(item.id);
                  return (
                    <div key={item.id} className="rounded-xl border border-border bg-card overflow-hidden">
                      <button
                        onClick={() => toggleItem(item.id)}
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/40 transition-all"
                      >
                        <span className="text-sm font-medium pr-4">{item.q}</span>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4">
                          <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                          <Link
                            to={`/help/${item.id}`}
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

          {filtered.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No articles found for "{search}"</p>
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
