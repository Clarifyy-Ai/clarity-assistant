import { Link } from "react-router-dom";
import { Mic, Brain, BarChart2, Shield, Zap, Users, ArrowRight, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

const FEATURES = [
  {
    icon: Mic,
    title: "Live Co-Pilot",
    desc: "Real-time AI answers streamed to an invisible overlay during your actual interview. Undetectable by screen sharing.",
  },
  {
    icon: Brain,
    title: "Mock Engine",
    desc: "Full interview simulations with filler-word tracking, WPM monitoring, and AI-generated scorecards after every session.",
  },
  {
    icon: BarChart2,
    title: "Deep Analytics",
    desc: "Track your confidence score, weak spots, and speaking habits over weeks. Compare sessions side by side.",
  },
  {
    icon: Shield,
    title: "Stealth Overlay",
    desc: "Compositor-layer separation ensures the overlay is invisible to Zoom, Teams, and all screen capture tools.",
  },
  {
    icon: Zap,
    title: "Prep Lab",
    desc: "STAR builder, answer rephraser, coding hints, system design guides — five tools to sharpen every answer.",
  },
  {
    icon: Users,
    title: "Practice Rooms",
    desc: "Team mock sessions with shared scorecards, custom question banks, and real-time coaching for every candidate.",
  },
];

const PROOF_POINTS = [
  "AI answers in under 1 second",
  "4 AI models, auto-routed by speed",
  "Works offline with instant fallback",
  "Resume + JD gap analysis built in",
  "Gamified streaks, XP, and badges",
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#07070d] text-white overflow-x-hidden">
      {/* ── Nav ────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-[#07070d]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Mic className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">ConfideQ</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link to="/blog" className="hover:text-white transition-colors">Blog</Link>
            <Link to="/help" className="hover:text-white transition-colors">Help</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-gray-300 hover:text-white transition-colors hidden sm:inline-block"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="text-sm font-semibold px-5 py-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative pt-40 pb-28 px-6">
        {/* Glow */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/20 rounded-full blur-[140px] pointer-events-none" />

        <div className="max-w-3xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <p className="inline-block text-xs font-semibold tracking-widest uppercase text-primary mb-6 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/[0.06]">
              AI-Powered Interview Platform
            </p>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.08] tracking-tight">
              Ace every interview.{" "}
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                Live & in practice.
              </span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-xl mx-auto leading-relaxed">
              Real-time AI coaching during live interviews, full mock simulations
              with deep analytics, and a growth platform that learns your weaknesses.
            </p>
          </motion.div>

          <motion.div
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <Link
              to="/signup"
              className="flex items-center gap-2 text-base font-semibold px-7 py-3.5 rounded-2xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-lg shadow-primary/25"
            >
              Start free <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/pricing"
              className="text-base font-medium px-7 py-3.5 rounded-2xl border border-white/10 text-gray-300 hover:border-white/20 hover:text-white transition-all"
            >
              View pricing
            </Link>
          </motion.div>

          {/* Proof points */}
          <motion.div
            className="mt-14 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            {PROOF_POINTS.map((p) => (
              <span key={p} className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary/70" />
                {p}
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Everything you need to interview with confidence
            </h2>
            <p className="mt-4 text-gray-400 max-w-lg mx-auto">
              From real-time live assistance to long-term skill tracking — one platform, every stage.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                className="group p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.45, delay: i * 0.08 }}
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Ready to stop guessing and start improving?
          </h2>
          <p className="mt-4 text-gray-400">
            Five free credits. No credit card. Cancel anytime.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 mt-8 text-base font-semibold px-8 py-4 rounded-2xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-lg shadow-primary/25"
          >
            Get started free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
          <span>© {new Date().getFullYear()} ConfideQ. All rights reserved.</span>
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
