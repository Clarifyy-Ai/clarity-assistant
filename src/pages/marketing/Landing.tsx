import { Link } from "react-router-dom";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  Brain, BarChart2, Shield, Zap, ArrowRight, CheckCircle2,
  Mic, Star, TrendingUp, Clock, Target,
  Upload, Cpu, MessageSquare, Landmark,
  Check, X, ChevronRight,
} from "lucide-react";
import { LazyMotion, domAnimation, m } from "framer-motion";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { PLANS, type PlanId } from "@/lib/billing/subscriptionManager";
import { LAUNCH_PLANS } from "@/lib/constants/pricing";
import { SALES_EMAIL } from "@/lib/constants/contact";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import {
  AiProviderStrip,
  ProductDemoHero,
  PracticeCoachWalkthrough,
  FeatureShowcase,
  GovExamShowcase,
} from "@/components/marketing";

// ─── Data ─────────────────────────────────────────────────────────────────────

const STEPS = [
  {
    num: "01",
    icon: Upload,
    title: "Sign up & set up",
    desc: "Create your free Clarify AI account, paste your job description, and upload your resume. The AI generates a tailored question bank and gap analysis in seconds.",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    num: "02",
    icon: MessageSquare,
    title: "Practice with the mock engine",
    desc: "Run full interview simulations. Get scored on filler words, WPM, confidence, and answer quality. Review AI feedback after each session.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    num: "03",
    icon: Cpu,
    title: "Rehearse with Practice Coach",
    desc: "Run a live practice session with the AI coach. Hear yourself, get instant talking-point hints, then review a full debrief — so the real interview feels like a re-run.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
];

const FEATURES = [
  {
    icon: Mic,
    title: "Practice Coach",
    desc: "Real-time AI talking-point hints streamed to an on-screen prep overlay during your practice sessions.",
    details: [
      "Sub-1-second hint latency",
      "Multi-model routing (Gemini, GPT-4o, Claude)",
      "STAR-format answers auto-structured",
      "Practice-only — not for use in real interviews",
    ],
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
  },
  {
    icon: Brain,
    title: PRODUCT_NAMES.mockInterview,
    desc: "Full interview simulations with AI-generated scorecards, filler-word tracking, and WPM monitoring.",
    details: [
      "Behavioral, technical, and system design modes",
      "Real-time filler word detection",
      "Confidence and pacing scores",
      "Post-session AI feedback report",
    ],
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  {
    icon: Zap,
    title: "Prep Lab",
    desc: "Five tools to sharpen every answer before the interview — from STAR builder to coding hints.",
    details: [
      "STAR answer builder and rephraser",
      "Coding problem hints and explanations",
      "System design frameworks and guides",
      "Resume vs JD gap analysis",
    ],
    color: "text-fuchsia-400",
    bg: "bg-fuchsia-500/10",
    border: "border-fuchsia-500/20",
  },
  {
    icon: BarChart2,
    title: "Analytics",
    desc: "Track confidence scores, weak spots, and speaking habits over weeks of practice sessions.",
    details: [
      "Session-over-session progress tracking",
      "Weak topic identification",
      "Speaking habit trend charts",
      "Exportable scorecard history",
    ],
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  {
    icon: Landmark,
    title: PRODUCT_NAMES.govExams,
    desc: "Timed MCQ sessions for UPSC, SSC, IBPS, JEE, NEET, and PSU exams with official previous year papers.",
    details: [
      "Full exam simulation with question palette",
      "UPSC · SSC · IBPS · JEE · NEET · PSU",
      "Practice and strict exam modes",
      "Accuracy analytics and revision queue",
    ],
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
];

const STATS = [
  { value: "< 1s",   label: "AI hint latency",            icon: Clock },
  { value: "3+",     label: "AI providers routed",        icon: Brain },
  { value: "6",      label: "Practice coaching features", icon: Target },
  { value: "50",     label: "Free credits / month",       icon: Shield },
];

const COMPARISON = [
  {
    feature: "Live AI practice coach with hints",
    clarify: true,
    competitor: "Partial",
    generic: false,
  },
  {
    feature: "Sub-1s AI hint latency",
    clarify: true,
    competitor: "Partial",
    generic: false,
  },
  {
    feature: "Mock interview with scorecards",
    clarify: true,
    competitor: true,
    generic: false,
  },
  {
    feature: "Gov exam MCQ mock tests (UPSC, SSC, IBPS)",
    clarify: true,
    competitor: false,
    generic: false,
  },
  {
    feature: "Resume vs JD gap analysis",
    clarify: true,
    competitor: false,
    generic: false,
  },
  {
    feature: "STAR builder & answer rephraser",
    clarify: true,
    competitor: "Partial",
    generic: false,
  },
  {
    feature: "Post-session debrief & analytics",
    clarify: true,
    competitor: false,
    generic: false,
  },
  {
    feature: "Multi-model AI (Gemini, GPT-4o, Claude)",
    clarify: true,
    competitor: false,
    generic: false,
  },
  {
    feature: "Filler word & WPM tracking",
    clarify: true,
    competitor: true,
    generic: false,
  },
];

const TESTIMONIALS = [
  {
    quote: "I went from blanking on behavioral questions to having a crisp STAR answer ready in seconds. Got the offer from my dream company.",
    name: "Marcus T.",
    role: "Software Engineer, FAANG",
    rating: 5,
    initials: "MT",
    color: "bg-primary",
    persona: "Senior candidate",
  },
  {
    quote: "The live practice coach is the closest thing I've found to a real mock interviewer on demand. After two weeks of nightly sessions I walked into the loop with zero nerves.",
    name: "Priya S.",
    role: "Product Manager, Series B",
    rating: 5,
    initials: "PS",
    color: "bg-blue-500",
    persona: "Career switcher",
  },
  {
    quote: "After 10 mock sessions the analytics showed exactly which answers I was stumbling on. Fixed them. Passed every panel interview after that.",
    name: "James R.",
    role: "Senior Data Scientist",
    rating: 5,
    initials: "JR",
    color: "bg-emerald-500",
    persona: "Bootcamp grad",
  },
];

const FAQS = [
  {
    q: "What is Clarify AI?",
    a: "Clarify AI is an interview preparation platform that combines a live AI practice coach, a full mock interview engine, a prep lab, and detailed analytics. It is designed for rehearsal — to help you walk into the real interview prepared and confident.",
  },
  {
    q: "Can I use Clarify AI during a real interview?",
    a: "No. Clarify AI is built strictly for practice. Using AI assistance covertly during a real interview violates most employer and assessment policies and may breach the terms of platforms like Zoom, Teams, Google Meet, HackerRank, and CoderPad. The on-screen overlay is a normal window and is visible to screen-sharing tools.",
  },
  {
    q: "Which AI models does Clarify AI use?",
    a: "Clarify AI routes each request to the best model for the job: Google Gemini 2.0 Flash for sub-second live hints, OpenAI GPT-4o for deep reasoning, and Anthropic Claude for system design and behavioural depth. Deepgram powers live transcription. Pro plans unlock full multi-model selection in Settings.",
  },
  {
    q: "How much does Clarify AI cost?",
    a: "Free includes 50 credits per month — enough to try Practice Coach and a mock session. Pro is a one-time purchase for 1,400 credits and the full feature set. Max is a one-time purchase for 4,000 credits and priority model access.",
  },
  {
    q: "What is included in the free plan?",
    a: "The free plan gives you 50 credits per month, access to the mock engine, prep lab tools, and basic analytics. Upgrade to Pro when you need more AI coaching volume.",
  },
  {
    q: "Does it work for all interview types?",
    a: "Yes. Clarify AI supports behavioral interviews (STAR format), technical coding rounds (with hints and explanations), system design interviews (with frameworks and diagrams), and general Q&A. The prep lab covers more than 500 common interview topics.",
  },
];

const PROOF_POINTS = [
  "AI hints in under 1 second",
  "Gemini, GPT-4o, and Claude — intelligently routed",
  "Full STAR builder & answer rephraser",
  "Resume + JD gap analysis built in",
  "Gamified streaks, XP, and badges",
  "50 free credits / month — upgrade to Pro for 1,400",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPlanTeaserFeatures(planId: PlanId): string[] {
  const plan = PLANS[planId];
  const creditsLabel = `${plan.creditsPerMonth.toLocaleString()} credits/month`;

  const featureLabels = plan.features
    .filter((f) => f.included)
    .map((f) => {
      if (f.limit === "unlimited") return f.label;
      if (typeof f.limit === "number" && f.note) return `${f.label} (${f.note})`;
      if (typeof f.limit === "number") return `${f.label} (${f.limit})`;
      return f.label;
    });

  return [creditsLabel, ...featureLabels].slice(0, 4);
}

function fadeUp(delay = 0) {
  return {
    initial:    { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport:   { once: true },
    transition: { duration: 0.5, delay },
  };
}

function CellValue({ value }: { value: boolean | string }) {
  if (value === true) return <Check className="w-5 h-5 text-emerald-500 mx-auto" />;
  if (value === false) return <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />;
  return <span className="text-xs text-amber-400 font-medium">{value}</span>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Landing() {
  usePageMeta({
    title: "Clarify AI — Practice every interview with AI by your side",
    description: "Live AI practice coach, full mock interview engine with analytics, and a complete prep lab. Multi-model routing across Gemini, GPT-4o, and Claude. Start free with 50 credits / month.",
    canonical: "https://clarify.ai.sltfinanceindia.com/",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Clarify AI",
        url: "https://clarify.ai.sltfinanceindia.com/",
        description: "AI-powered interview preparation platform.",
      },
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Clarify AI",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      },
    ],
  });

  return (
    <MarketingLayout>
      <LazyMotion features={domAnimation} strict>
      {/* ── Hero (first viewport: brand · headline · support · CTA · product visual) ─ */}
      <section className="pt-4 sm:pt-8 pb-10 px-4 sm:px-6 text-center">
        <m.div
          className="max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-[1.08]">
            Practice every interview with{" "}
            <span className="bg-gradient-to-r from-primary via-fuchsia-400 to-blue-400 bg-clip-text text-transparent">
              AI by your side
            </span>
          </h1>
          <p className="mt-5 text-sm md:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            A live AI practice coach, mock interviews, and a full prep lab — so you walk into the real interview ready, not anxious.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-lg shadow-primary/25"
            >
              Get started free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl border border-border text-foreground hover:bg-secondary/60 transition-all"
            >
              See pricing
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            No credit card required &middot; Free plan includes 50 credits / month
          </p>
        </m.div>

        <div className="mt-10 max-w-4xl mx-auto">
          <ProductDemoHero />
        </div>
      </section>

      {/* ── Below-fold proof strips (deferred from first viewport) ───────────── */}
      <section className="pb-10 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-5">
          <p className="text-xs text-muted-foreground/80 text-center max-w-xl">
            AI features are for rehearsal and preparation only — not for use during actual third-party interviews.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
            Gemini · GPT-4o · Claude — multi-model AI coaching
          </div>
          <AiProviderStrip compact />
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/gov-exams"
              className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-amber-500/30 text-amber-600 hover:bg-amber-500/10 transition-all"
            >
              <Landmark className="w-3.5 h-3.5" />
              Gov exam mock tests
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats ───────────────────────────────────────────────────────────── */}
      <section className="pb-14 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map((stat, i) => (
            <m.div
              key={stat.label}
              {...fadeUp(i * 0.08)}
              className="rounded-2xl border border-border bg-card p-5 text-center"
            >
              <stat.icon className="w-5 h-5 text-primary mx-auto mb-2" />
              <p className="text-xl sm:text-2xl font-extrabold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </m.div>
          ))}
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────────── */}
      <section className="pb-14 sm:pb-16 px-4 sm:px-6 bg-secondary/20">
        <div className="max-w-5xl mx-auto py-14">
          <m.div className="text-center mb-12" {...fadeUp()}>
            <h2 className="text-2xl md:text-3xl font-bold">How it works</h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
              From first upload to your next offer — three simple steps.
            </p>
          </m.div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            {STEPS.map((step, i) => (
              <m.div key={step.num} {...fadeUp(i * 0.1)} className="relative">
                {i < STEPS.length - 1 && (
                  <div className="hidden sm:flex absolute top-10 left-[calc(100%+8px)] w-8 items-center">
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                  </div>
                )}
                <div className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center mb-4",
                  step.bg,
                )}>
                  <step.icon className={cn("w-6 h-6", step.color)} />
                </div>
                <div className="text-3xl font-black text-primary/15 mb-2">{step.num}</div>
                <h3 className="text-sm font-bold mb-2">{step.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
              </m.div>
            ))}
          </div>
        </div>
      </section>

      <PracticeCoachWalkthrough />

      <section id="gov-exams" className="px-4 sm:px-6 bg-amber-500/5 border-y border-amber-500/10">
        <div className="max-w-5xl mx-auto py-8 sm:py-10">
          <m.div className="text-center mb-5" {...fadeUp()}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-medium text-amber-600 mb-4">
              <Landmark className="w-3.5 h-3.5" />
              UPSC · SSC · IBPS · JEE · NEET · PSU
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold">
              Government & competitive exam mock tests
            </h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
              Full-length timed MCQ sessions with official previous year papers, question palette,
              and performance analytics — built for serious exam prep.
            </p>
          </m.div>
          <m.div {...fadeUp(0.1)}>
            <GovExamShowcase />
          </m.div>
          <m.div className="text-center mt-6" {...fadeUp(0.2)}>
            <Link
              to="/gov-exams"
              className="inline-flex items-center gap-2 text-sm font-semibold text-amber-600 hover:underline"
            >
              Learn more about gov exam prep
              <ArrowRight className="w-4 h-4" />
            </Link>
          </m.div>
        </div>
      </section>

      {/* ── Feature Pillars ─────────────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-20 pt-6 pb-10 sm:pb-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <m.div className="text-center mb-4" {...fadeUp()}>
            <h2 className="text-2xl sm:text-3xl font-bold">
              Five pillars. One complete prep system.
            </h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
              Interview coaching, gov exam mock tests, and analytics — every feature works together.
            </p>
          </m.div>

          <m.div {...fadeUp(0.1)} className="mb-6">
            <FeatureShowcase />
          </m.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {FEATURES.map((f, i) => (
              <m.div
                key={f.title}
                {...fadeUp(i * 0.08)}
                className={cn(
                  "group rounded-2xl border bg-card p-6 hover:border-primary/30 hover:bg-card/80 transition-all",
                  f.border,
                )}
              >
                <div className="flex items-start gap-4">
                  <div className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform",
                    f.bg,
                  )}>
                    <f.icon className={cn("w-5 h-5", f.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold">{f.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
                <ul className="mt-5 space-y-2">
                  {f.details.map((d) => (
                    <li key={d} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className={cn("w-3.5 h-3.5 flex-shrink-0", f.color)} />
                      {d}
                    </li>
                  ))}
                </ul>
              </m.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comparison Table ────────────────────────────────────────────────── */}
      <section className="pb-14 px-4 sm:px-6 bg-secondary/20">
        <div className="max-w-4xl mx-auto py-14">
          <m.div className="text-center mb-10" {...fadeUp()}>
            <h2 className="text-2xl md:text-3xl font-bold">How we compare</h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
              Clarify AI is built for live practice coaching and rehearsal — not covert assistance during real interviews.
            </p>
          </m.div>
          <m.div {...fadeUp(0.1)} className="overflow-x-auto rounded-2xl border border-border">
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left px-5 py-4 font-semibold text-foreground w-1/2">Feature</th>
                  <th className="px-4 py-4 font-semibold text-center">
                    <span className="inline-flex items-center gap-1.5 text-primary">
                      <Zap className="w-3.5 h-3.5" />
                      Clarify AI
                    </span>
                  </th>
                  <th className="px-4 py-4 font-semibold text-center text-muted-foreground">Other AI Tools</th>
                  <th className="px-4 py-4 font-semibold text-center text-muted-foreground">Generic tools</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row, i) => (
                  <tr
                    key={row.feature}
                    className={cn(
                      "border-b border-border last:border-0",
                      i % 2 === 0 ? "bg-background" : "bg-secondary/10",
                    )}
                  >
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">{row.feature}</td>
                    <td className="px-4 py-3.5 text-center">
                      <CellValue value={row.clarify} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <CellValue value={row.competitor} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <CellValue value={row.generic} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </m.div>
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────────────────────────── */}
      <section className="pb-14 sm:pb-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <m.div className="text-center mb-10" {...fadeUp()}>
            <h2 className="text-2xl sm:text-3xl font-bold">Candidates who got the offer</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Real results from people just like you.
            </p>
          </m.div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
            {TESTIMONIALS.map((t, i) => (
              <m.div
                key={t.name}
                {...fadeUp(i * 0.1)}
                className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex gap-0.5">
                    {Array.from({ length: t.rating }).map((_, j) => (
                      <Star key={j} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <span className="text-[10px] text-muted-foreground/60 border border-border rounded-full px-2 py-0.5">
                    {t.persona}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                  "{t.quote}"
                </p>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0",
                    t.color,
                  )}>
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{t.name}</p>
                    <p className="text-[10px] text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </m.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Proof points ────────────────────────────────────────────────────── */}
      <section className="pb-14 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <m.h2 className="text-2xl sm:text-3xl font-bold mb-8" {...fadeUp()}>
            Built for serious candidates
          </m.h2>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
            {PROOF_POINTS.map((point, i) => (
              <m.div
                key={point}
                {...fadeUp(i * 0.05)}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground"
              >
                <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                {point}
              </m.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing Teaser ──────────────────────────────────────────────────── */}
      <section className="pb-14 px-4 sm:px-6 bg-secondary/20">
        <div className="max-w-4xl mx-auto py-14">
          <m.div className="text-center mb-10" {...fadeUp()}>
            <h2 className="text-2xl md:text-3xl font-bold">Simple, transparent pricing</h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
              Start free. Upgrade when you're ready. No credit card required.
            </p>
          </m.div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {LAUNCH_PLANS.map((planId, i) => {
              const plan = PLANS[planId];
              const isMax = planId === "enterprise";
              const priceDisplay = isMax
                ? "$79"
                : plan.monthlyPrice === 0
                  ? "$0"
                  : `$${(plan.monthlyPrice / 100).toFixed(0)}`;
              const period = isMax
                ? " one-time"
                : plan.monthlyPrice === 0
                  ? "forever"
                  : " one-time";
              const cta = isMax
                ? "Get Max"
                : planId === "free"
                  ? "Start Free"
                  : "Get Pro";
              const to = isMax
                ? `/signup?plan=${planId}`
                : planId === "free"
                  ? "/signup"
                  : `/signup?plan=${planId}`;

              return (
              <m.div
                key={planId}
                {...fadeUp(i * 0.1)}
                className={cn(
                  "relative rounded-2xl border p-6 flex flex-col",
                  plan.isPopular
                    ? "border-primary/40 bg-primary/[0.04] shadow-lg shadow-primary/10"
                    : "border-border bg-card",
                )}
              >
                {plan.isPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-semibold bg-primary text-primary-foreground">
                    Most Popular
                  </span>
                )}
                <h3 className="text-base font-bold">{plan.displayName}</h3>
                <p className="text-xs text-muted-foreground mt-1">{plan.tagline}</p>
                <div className="mt-5 mb-5">
                  <span className="text-3xl font-extrabold">{priceDisplay}</span>
                  <span className="text-sm text-muted-foreground ml-1">{period}</span>
                </div>
                <ul className="space-y-2 flex-1">
                  {formatPlanTeaserFeatures(planId).map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                {to.startsWith("mailto:") ? (
                  <a
                    href={to}
                    className={cn(
                      "mt-6 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
                      "bg-secondary text-foreground hover:bg-secondary/80",
                    )}
                  >
                    {cta} <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <Link
                    to={to}
                    className={cn(
                      "mt-6 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
                      plan.isPopular
                        ? "bg-primary text-primary-foreground hover:opacity-90"
                        : "bg-secondary text-foreground hover:bg-secondary/80",
                    )}
                  >
                    {cta} <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </m.div>
              );
            })}
          </div>
          <m.div className="text-center mt-6" {...fadeUp(0.3)}>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              See full pricing and all plan details <ChevronRight className="w-4 h-4" />
            </Link>
          </m.div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────────── */}
      <section className="pb-14 sm:pb-16 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto">
          <m.div className="text-center mb-10" {...fadeUp()}>
            <h2 className="text-2xl sm:text-3xl font-bold">Frequently asked questions</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Have more questions?{" "}
              <Link to="/help" className="text-primary hover:underline">
                Visit the help center
              </Link>
              .
            </p>
          </m.div>
          <m.div {...fadeUp(0.1)}>
            <Accordion type="single" collapsible className="w-full rounded-2xl border border-border bg-card overflow-hidden">
              {FAQS.map((faq, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="border-border px-5 last:border-b-0"
                >
                  <AccordionTrigger className="text-sm font-semibold text-left hover:no-underline hover:text-primary py-4">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </m.div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <section className="pb-16 sm:pb-20 px-4 sm:px-6">
        <m.div
          {...fadeUp()}
          className="max-w-2xl mx-auto text-center rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-blue-500/10 p-8 sm:p-10"
        >
          <TrendingUp className="w-8 h-8 text-primary mx-auto mb-4" />
          <h2 className="text-2xl sm:text-3xl font-extrabold mb-3">
            Your next interview is closer than you think
          </h2>
          <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
            Join candidates who use Clarify AI to prepare faster, practice smarter,
            and walk in with AI confidence.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-xl shadow-primary/30"
          >
            Get started free <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="mt-4 text-xs text-muted-foreground">
            Free plan &middot; No card required &middot; Cancel anytime
          </p>
        </m.div>
      </section>
      </LazyMotion>
    </MarketingLayout>
  );
}
