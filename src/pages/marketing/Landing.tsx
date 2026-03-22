import { Link } from "react-router-dom";
import {
  Brain, BarChart2, Shield, Zap, Users, ArrowRight, CheckCircle2,
  Mic, Star, ChevronRight, Play, TrendingUp, Clock, Target,
} from "lucide-react";
import { motion } from "framer-motion";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { cn } from "@/lib/utils";

// ─── Data ─────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Mic,
    title: "Live Co-Pilot",
    desc: "Real-time AI answers streamed to an invisible stealth overlay during your actual interview. Undetectable by screen sharing software.",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
  },
  {
    icon: Brain,
    title: "Mock Engine",
    desc: "Full interview simulations with filler-word tracking, WPM monitoring, and AI-generated scorecards after every session.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    icon: BarChart2,
    title: "Deep Analytics",
    desc: "Track your confidence score, weak spots, and speaking habits over weeks. Compare sessions and spot patterns.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  {
    icon: Shield,
    title: "Stealth Overlay",
    desc: "Compositor-layer separation ensures the overlay is invisible to Zoom, Teams, Google Meet, and all screen capture tools.",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    icon: Zap,
    title: "Prep Lab",
    desc: "STAR builder, answer rephraser, coding hints, system design guides — five tools to sharpen every answer before the interview.",
    color: "text-fuchsia-400",
    bg: "bg-fuchsia-500/10",
  },
  {
    icon: Users,
    title: "Practice Rooms",
    desc: "Team mock sessions with shared scorecards, custom question banks, and real-time coaching for bootcamps and teams.",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
  },
];

const STATS = [
  { value: "< 1s",   label: "AI answer latency",    icon: Clock },
  { value: "4",      label: "AI models, auto-routed", icon: Brain },
  { value: "6",      label: "Live coaching features", icon: Target },
  { value: "98%",    label: "Overlay detection rate", icon: Shield },
];

const TESTIMONIALS = [
  {
    quote: "I went from blanking on behavioral questions to having a crisp STAR answer ready in seconds. Got the offer from my dream company.",
    name: "Marcus T.",
    role: "Software Engineer, FAANG",
    rating: 5,
    initials: "MT",
    color: "bg-violet-500",
  },
  {
    quote: "The stealth overlay is unreal. I had AI-powered hints during my entire technical loop without anyone knowing. Accepted the role at 40% higher comp.",
    name: "Priya S.",
    role: "Product Manager, Series B",
    rating: 5,
    initials: "PS",
    color: "bg-blue-500",
  },
  {
    quote: "After 10 mock sessions the analytics showed exactly which answers I was stumbling on. Fixed them. Passed every panel interview after that.",
    name: "James R.",
    role: "Senior Data Scientist",
    rating: 5,
    initials: "JR",
    color: "bg-emerald-500",
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

const STEPS = [
  {
    num: "01",
    title: "Upload your resume & JD",
    desc: "Paste the job description and upload your resume. Clarify AI performs a gap analysis and generates tailored questions.",
  },
  {
    num: "02",
    title: "Run a mock session",
    desc: "Practice with the mock engine. Get a full scorecard covering confidence, filler words, WPM, and answer quality.",
  },
  {
    num: "03",
    title: "Go live with the overlay",
    desc: "Enable the stealth overlay before your real interview. AI-powered answers appear invisibly — only you can see them.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

function fadeUp(delay = 0) {
  return {
    initial:    { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport:   { once: true },
    transition: { duration: 0.5, delay },
  };
}

export default function Landing() {
  return (
    <MarketingLayout>
      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="pt-24 sm:pt-36 pb-16 sm:pb-24 px-4 sm:px-6 text-center">
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

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.08]">
            Ace every interview with{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-blue-400 bg-clip-text text-transparent">
              AI by your side
            </span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Real-time coaching during live interviews. Mock sessions with deep analytics.
            A full prep lab — and a stealth overlay your interviewer will never see.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 text-sm font-semibold px-7 py-3.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-lg shadow-primary/25"
            >
              Get started free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 text-sm font-medium px-7 py-3.5 rounded-xl border border-border text-foreground hover:bg-secondary/60 transition-all"
            >
              <Play className="w-3.5 h-3.5" />
              See pricing
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            No credit card required &middot; Free plan includes 20 credits/month
          </p>
        </motion.div>
      </section>

      {/* ── Stats ───────────────────────────────────────────────────────────── */}
      <section className="pb-16 sm:pb-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              {...fadeUp(i * 0.08)}
              className="rounded-2xl border border-border bg-card p-5 text-center"
            >
              <stat.icon className="w-5 h-5 text-primary mx-auto mb-2" />
              <p className="text-2xl sm:text-3xl font-extrabold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section className="pb-16 sm:pb-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div className="text-center mb-10" {...fadeUp()}>
            <h2 className="text-2xl sm:text-3xl font-bold">
              Everything you need to land the role
            </h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
              Six tightly integrated tools that work together before, during, and after your interview.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                {...fadeUp(i * 0.07)}
                className="group rounded-2xl border border-border bg-card p-6 hover:border-primary/30 hover:bg-card/80 transition-all"
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform",
                  f.bg
                )}>
                  <f.icon className={cn("w-5 h-5", f.color)} />
                </div>
                <h3 className="text-base font-bold">{f.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────────── */}
      <section className="pb-16 sm:pb-24 px-4 sm:px-6 bg-secondary/20">
        <div className="max-w-4xl mx-auto py-16 sm:py-20">
          <motion.div className="text-center mb-12" {...fadeUp()}>
            <h2 className="text-2xl sm:text-3xl font-bold">How it works</h2>
            <p className="mt-3 text-sm text-muted-foreground">Three steps to interview confidence</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            {STEPS.map((step, i) => (
              <motion.div key={step.num} {...fadeUp(i * 0.1)} className="relative">
                {i < STEPS.length - 1 && (
                  <div className="hidden sm:block absolute top-8 left-[calc(100%+8px)] w-8 h-px bg-border z-10" />
                )}
                <div className="text-3xl font-black text-primary/20 mb-3">{step.num}</div>
                <h3 className="text-sm font-bold mb-2">{step.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────────────────────────── */}
      <section className="pb-16 sm:pb-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div className="text-center mb-10" {...fadeUp()}>
            <h2 className="text-2xl sm:text-3xl font-bold">Candidates who got the offer</h2>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={t.name}
                {...fadeUp(i * 0.1)}
                className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4"
              >
                <div className="flex gap-0.5">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                  "{t.quote}"
                </p>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0",
                    t.color
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
      <section className="pb-16 sm:pb-20 px-4 sm:px-6">
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

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <section className="pb-24 sm:pb-32 px-4 sm:px-6">
        <motion.div
          {...fadeUp()}
          className="max-w-2xl mx-auto text-center rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-violet-500/5 to-blue-500/10 p-10 sm:p-14"
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
            className="inline-flex items-center gap-2 text-base font-semibold px-10 py-4 rounded-2xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-xl shadow-primary/30"
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
