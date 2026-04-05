import { Link } from "react-router-dom";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  Brain, BarChart2, Shield, Zap, ArrowRight, CheckCircle2,
  Mic, Star, Play, TrendingUp, Clock, Target,
  Upload, Cpu, MessageSquare,
  Check, X, ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

// ─── Data ─────────────────────────────────────────────────────────────────────

const STEPS = [
  {
    num: "01",
    icon: Upload,
    title: "Install & set up",
    desc: "Download Clarify AI, paste your job description, and upload your resume. The AI generates a tailored question bank and gap analysis in seconds.",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
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
    title: "Ace your live interview",
    desc: "Enable the stealth overlay before going live. AI answers appear instantly — only visible to you, invisible to screen capture and interviewers.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
];

const FEATURES = [
  {
    icon: Mic,
    title: "Live Co-Pilot",
    desc: "Real-time AI answers streamed to an invisible stealth overlay during your actual interview.",
    details: [
      "Sub-1-second answer latency",
      "Invisible to Zoom, Teams, and Google Meet",
      "STAR-format answers auto-structured",
      "Automatically adapts to question type",
    ],
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
  },
  {
    icon: Brain,
    title: "Mock Engine",
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
];

const STATS = [
  { value: "< 1s",   label: "AI answer latency",    icon: Clock },
  { value: "4",      label: "AI models, auto-routed", icon: Brain },
  { value: "6",      label: "Live coaching features", icon: Target },
  { value: "98%",    label: "Overlay undetection rate", icon: Shield },
];

const COMPARISON = [
  {
    feature: "Real-time stealth overlay",
    clarify: true,
    competitor: false,
    generic: false,
  },
  {
    feature: "Sub-1s AI answer latency",
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
    feature: "Resume vs JD gap analysis",
    clarify: true,
    competitor: false,
    generic: false,
  },
  {
    feature: "BYOK (bring your own API key)",
    clarify: true,
    competitor: false,
    generic: false,
  },
  {
    feature: "Works offline (resume fallback)",
    clarify: true,
    competitor: false,
    generic: false,
  },
  {
    feature: "Multi-model routing (GPT-4o + Claude + Gemini)",
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
    color: "bg-violet-500",
    persona: "Senior candidate",
  },
  {
    quote: "The stealth overlay is unreal. I had AI-powered hints during my entire technical loop without anyone knowing. Accepted the role at 40% higher comp.",
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
    a: "Clarify AI is an interview preparation platform that combines a real-time AI co-pilot, full mock interview engine, prep lab tools, and deep analytics. The stealth overlay lets you receive AI-generated answers during live interviews without your interviewer knowing.",
  },
  {
    q: "How does the stealth overlay work?",
    a: "The overlay renders in a separate compositor layer that is excluded from screen capture APIs used by Zoom, Google Meet, Microsoft Teams, and similar tools. Your interviewer only sees your camera feed — you see both the call and the AI answers.",
  },
  {
    q: "Is it detectable?",
    a: "The stealth overlay is designed to be invisible to screen-sharing and screen-capture software. It uses OS-level compositor separation so capture APIs never see the overlay window. We maintain a 98% undetection rate across the major video platforms.",
  },
  {
    q: "Which AI models does Clarify use?",
    a: "Clarify AI auto-routes between GPT-4o, Claude 3.5 Sonnet, and Gemini 1.5 Pro based on speed and question type. Pro and Elite subscribers can also bring their own API key (BYOK) to use personal model quotas.",
  },
  {
    q: "How much does Clarify AI cost?",
    a: "There is a free plan that includes 20 credits per month — enough for several mock sessions. Paid plans start at $19/month (Starter) and go up to $79/month (Elite). Annual billing saves 20%. See the full pricing page for details.",
  },
  {
    q: "What is included in the free plan?",
    a: "The free plan gives you 20 credits per month, access to the mock engine, prep lab tools, and basic analytics. The stealth overlay is available on Starter and above.",
  },
  {
    q: "Can I bring my own API key (BYOK)?",
    a: "Yes. Pro and Elite subscribers can connect their own OpenAI, Anthropic, or Google API keys. BYOK credits are tracked separately and do not count against your monthly plan credits.",
  },
  {
    q: "Does it work for all interview types?",
    a: "Yes. Clarify AI supports behavioral interviews (STAR format), technical coding rounds (with hints and explanations), system design interviews (with frameworks and diagrams), and general Q&A. The question bank covers over 500 common interview topics.",
  },
];

const PROOF_POINTS = [
  "AI answers in under 1 second",
  "4 AI models, auto-routed by speed",
  "Works offline with resume fallback",
  "Resume + JD gap analysis built in",
  "Gamified streaks, XP, and badges",
  "Stealth overlay undetectable by Zoom",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    title: "Clarify AI — Ace Every Interview with AI by Your Side",
    description: "Real-time AI coaching during live interviews, mock sessions with deep analytics, and a full prep lab. Start free today.",
  });

  return (
    <MarketingLayout>
      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="pt-20 sm:pt-28 pb-14 px-4 sm:px-6 text-center">
        <motion.div
          className="max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Powered by GPT-4o, Claude 3.5, and Gemini 1.5
          </div>

          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-[1.08]">
            Ace every interview with{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-blue-400 bg-clip-text text-transparent">
              AI by your side
            </span>
          </h1>
          <p className="mt-5 text-sm md:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Real-time coaching during live interviews. Mock sessions with deep analytics.
            A full prep lab — and a stealth overlay your interviewer will never see.
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
              <Play className="w-3.5 h-3.5" />
              See pricing
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            No credit card required &middot; Free plan includes 20 credits/month
          </p>
        </motion.div>

        {/* Product mockup */}
        <motion.div
          className="mt-14 max-w-4xl mx-auto"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <div className="relative rounded-2xl border border-border bg-card shadow-2xl shadow-black/30 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-secondary/30">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-400/70" />
                <span className="w-3 h-3 rounded-full bg-amber-400/70" />
                <span className="w-3 h-3 rounded-full bg-emerald-400/70" />
              </div>
              <div className="flex-1 mx-4">
                <div className="h-5 rounded-md bg-secondary/60 w-48 mx-auto text-[10px] text-muted-foreground/60 flex items-center justify-center">
                  Clarify AI — Live Session
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400 font-medium">Live</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 min-h-[280px] sm:min-h-[340px]">
              <div className="md:col-span-2 border-r border-border p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <Mic className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">Mock Interview — Software Engineer</p>
                      <p className="text-[10px] text-muted-foreground">FAANG Behavioral Round</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-[10px] font-medium text-primary border border-primary/20">
                    Co-Pilot Active
                  </span>
                </div>
                <div className="rounded-xl border border-border bg-secondary/20 p-4 flex-1 flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Interviewer question</p>
                  <p className="text-sm font-semibold leading-relaxed">
                    "Tell me about a time you had to lead a project under a tight deadline with limited resources."
                  </p>
                  <div className="mt-auto pt-3 border-t border-border">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Zap className="w-3 h-3 text-primary" />
                      <p className="text-[10px] text-primary font-semibold uppercase tracking-wide">AI Co-Pilot — STAR Answer</p>
                    </div>
                    <div className="space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                      <p><span className="font-semibold text-foreground">Situation:</span> Led a 3-person team to ship a critical feature two weeks ahead of schedule...</p>
                      <p><span className="font-semibold text-foreground">Task:</span> Coordinated across design, backend, and QA while managing stakeholder expectations...</p>
                      <p><span className="font-semibold text-foreground">Action:</span> Ran daily standups, cut scope in half, and shipped an MVP first...</p>
                      <p><span className="font-semibold text-foreground">Result:</span> Delivered on time, reduced bug count by 40%, received praise from VP of Eng...</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-5 flex flex-col gap-4 bg-secondary/10">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Live Metrics</p>
                <div className="space-y-3">
                  {[
                    { label: "Confidence", value: 87, color: "bg-emerald-500" },
                    { label: "Clarity", value: 92, color: "bg-blue-500" },
                    { label: "Pacing (WPM)", value: 74, color: "bg-violet-500" },
                  ].map((m) => (
                    <div key={m.label}>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                        <span>{m.label}</span>
                        <span className="font-semibold text-foreground">{m.value}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-secondary">
                        <div
                          className={cn("h-1.5 rounded-full", m.color)}
                          style={{ width: `${m.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-auto space-y-2">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Topics covered</p>
                  {["Leadership", "Time management", "Prioritization"].map((t) => (
                    <div key={t} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0" />
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            The AI overlay is invisible to your interviewer — only you see it.
          </p>
        </motion.div>
      </section>

      {/* ── Stats ───────────────────────────────────────────────────────────── */}
      <section className="pb-14 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              {...fadeUp(i * 0.08)}
              className="rounded-2xl border border-border bg-card p-5 text-center"
            >
              <stat.icon className="w-5 h-5 text-primary mx-auto mb-2" />
              <p className="text-xl sm:text-2xl font-extrabold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────────── */}
      <section className="pb-14 sm:pb-16 px-4 sm:px-6 bg-secondary/20">
        <div className="max-w-5xl mx-auto py-14">
          <motion.div className="text-center mb-12" {...fadeUp()}>
            <h2 className="text-2xl md:text-3xl font-bold">How it works</h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
              From first upload to your next offer — three simple steps.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            {STEPS.map((step, i) => (
              <motion.div key={step.num} {...fadeUp(i * 0.1)} className="relative">
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
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature Pillars ─────────────────────────────────────────────────── */}
      <section id="features" className="pb-14 sm:pb-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div className="text-center mb-10" {...fadeUp()}>
            <h2 className="text-2xl sm:text-3xl font-bold">
              Four pillars. One unfair advantage.
            </h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
              Every feature works together — before, during, and after your interviews.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {FEATURES.map((f, i) => (
              <motion.div
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
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comparison Table ────────────────────────────────────────────────── */}
      <section className="pb-14 px-4 sm:px-6 bg-secondary/20">
        <div className="max-w-4xl mx-auto py-14">
          <motion.div className="text-center mb-10" {...fadeUp()}>
            <h2 className="text-2xl md:text-3xl font-bold">How we compare</h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
              Clarify AI is the only platform built for real-time interview assistance, not just prep.
            </p>
          </motion.div>
          <motion.div {...fadeUp(0.1)} className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
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
            </table>
          </motion.div>
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────────────────────────── */}
      <section className="pb-14 sm:pb-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div className="text-center mb-10" {...fadeUp()}>
            <h2 className="text-2xl sm:text-3xl font-bold">Candidates who got the offer</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Real results from people just like you.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
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
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Proof points ────────────────────────────────────────────────────── */}
      <section className="pb-14 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <motion.h2 className="text-2xl sm:text-3xl font-bold mb-8" {...fadeUp()}>
            Built for serious candidates
          </motion.h2>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
            {PROOF_POINTS.map((point, i) => (
              <motion.div
                key={point}
                {...fadeUp(i * 0.05)}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground"
              >
                <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                {point}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing Teaser ──────────────────────────────────────────────────── */}
      <section className="pb-14 px-4 sm:px-6 bg-secondary/20">
        <div className="max-w-4xl mx-auto py-14">
          <motion.div className="text-center mb-10" {...fadeUp()}>
            <h2 className="text-2xl md:text-3xl font-bold">Simple, transparent pricing</h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
              Start free. Upgrade when you're ready. No credit card required.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              {
                name: "Free",
                price: "$0",
                period: "forever",
                tagline: "Get started without a card",
                features: ["20 credits/month", "Mock interview engine", "Prep lab tools", "Basic analytics"],
                cta: "Start Free",
                to: "/signup",
                highlight: false,
              },
              {
                name: "Pro",
                price: "$39",
                period: "/month",
                tagline: "Everything you need to land the role",
                features: ["300 credits/month", "Stealth overlay (live co-pilot)", "Advanced analytics", "BYOK support", "Calendar sync"],
                cta: "Get Pro",
                to: "/signup?plan=pro",
                highlight: true,
              },
              {
                name: "Elite",
                price: "$79",
                period: "/month",
                tagline: "For FAANG-level prep",
                features: ["1000 credits/month", "All Pro features", "Priority AI routing", "Practice rooms", "1-on-1 coaching"],
                cta: "Get Elite",
                to: "/signup?plan=elite",
                highlight: false,
              },
            ].map((plan, i) => (
              <motion.div
                key={plan.name}
                {...fadeUp(i * 0.1)}
                className={cn(
                  "relative rounded-2xl border p-6 flex flex-col",
                  plan.highlight
                    ? "border-primary/40 bg-primary/[0.04] shadow-lg shadow-primary/10"
                    : "border-border bg-card",
                )}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-semibold bg-primary text-primary-foreground">
                    Most Popular
                  </span>
                )}
                <h3 className="text-base font-bold">{plan.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{plan.tagline}</p>
                <div className="mt-5 mb-5">
                  <span className="text-3xl font-extrabold">{plan.price}</span>
                  <span className="text-sm text-muted-foreground ml-1">{plan.period}</span>
                </div>
                <ul className="space-y-2 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to={plan.to}
                  className={cn(
                    "mt-6 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
                    plan.highlight
                      ? "bg-primary text-primary-foreground hover:opacity-90"
                      : "bg-secondary text-foreground hover:bg-secondary/80",
                  )}
                >
                  {plan.cta} <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </motion.div>
            ))}
          </div>
          <motion.div className="text-center mt-6" {...fadeUp(0.3)}>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              See full pricing and all plan details <ChevronRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────────── */}
      <section className="pb-14 sm:pb-16 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto">
          <motion.div className="text-center mb-10" {...fadeUp()}>
            <h2 className="text-2xl sm:text-3xl font-bold">Frequently asked questions</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Have more questions?{" "}
              <Link to="/help" className="text-primary hover:underline">
                Visit the help center
              </Link>
              .
            </p>
          </motion.div>
          <motion.div {...fadeUp(0.1)}>
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
          </motion.div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <section className="pb-16 sm:pb-20 px-4 sm:px-6">
        <motion.div
          {...fadeUp()}
          className="max-w-2xl mx-auto text-center rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-violet-500/5 to-blue-500/10 p-8 sm:p-10"
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
        </motion.div>
      </section>
    </MarketingLayout>
  );
}
