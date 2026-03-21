import { Link } from "react-router-dom";
import { Brain, BarChart2, Shield, Zap, Users, ArrowRight, CheckCircle2, Mic } from "lucide-react";
import { motion } from "framer-motion";
import { MarketingLayout } from "@/components/layout/MarketingLayout";

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
    <MarketingLayout>
      <section className="pt-36 pb-24 px-6 text-center">
        <motion.div
          className="max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-[1.08]">
            Ace every interview with{" "}
            <span className="bg-gradient-to-r from-primary via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              AI by your side
            </span>
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Real-time coaching during live interviews, mock sessions with deep analytics,
            and a full prep lab — powered by GPT-4o, Claude & Gemini.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <Link
              to="/signup"
              className="text-sm font-semibold px-7 py-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-lg shadow-primary/25"
            >
              Get started free
            </Link>
            <Link
              to="/pricing"
              className="text-sm font-medium px-7 py-3 rounded-xl border border-border text-foreground hover:bg-secondary/60 transition-all"
            >
              See pricing
            </Link>
          </div>
        </motion.div>
      </section>

      <section className="pb-24 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              className="group rounded-2xl border border-border bg-card p-6 hover:border-primary/30 hover:bg-card/80 transition-all"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.07 }}
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <f.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-lg font-bold">{f.title}</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="pb-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">Built for serious candidates</h2>
          <div className="space-y-3">
            {PROOF_POINTS.map((point) => (
              <div key={point} className="inline-flex items-center gap-2 text-sm text-muted-foreground mr-6">
                <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                {point}
              </div>
            ))}
          </div>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 mt-8 text-base font-semibold px-8 py-4 rounded-2xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-lg shadow-primary/25"
          >
            Get started free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
