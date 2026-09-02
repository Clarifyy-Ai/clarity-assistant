import { Link } from "react-router-dom";
import { LazyMotion, domAnimation, m } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Clock,
  Landmark,
  Target,
  Upload,
  BarChart2,
  CheckCircle2,
} from "lucide-react";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { GovExamShowcase } from "@/components/marketing/GovExamShowcase";
import { usePageMeta } from "@/hooks/usePageMeta";
import { seoPageByPath } from "@/lib/seo/publicPages";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { PUBLIC_WEBSITE_URL } from "@/lib/constants/contact";
import { cn } from "@/lib/utils";

const EXAM_TYPES = [
  { name: "UPSC CSE", subjects: "GS Paper 1 & 2 · Current Affairs", badge: "Civil Services" },
  { name: "SSC CGL", subjects: "Reasoning · Quant · English · GK", badge: "Government" },
  { name: "IBPS PO", subjects: "Reasoning · Quant · English · Banking", badge: "Banking" },
  { name: "JEE Main", subjects: "Physics · Chemistry · Mathematics", badge: "Engineering" },
  { name: "NEET UG", subjects: "Biology · Physics · Chemistry", badge: "Medical" },
  { name: "HPCL / PSU", subjects: "Technical · English · Quant · Reasoning", badge: "PSU" },
];

const FEATURES = [
  {
    icon: BookOpen,
    title: "Official previous year papers",
    desc: "Practice with real exam patterns — timed mode, negative marking, and section-wise breakdowns.",
  },
  {
    icon: Clock,
    title: "Full exam simulation",
    desc: "Countdown timer, question palette, mark-for-review, and auto-submit when time runs out.",
  },
  {
    icon: Target,
    title: "Practice & exam modes",
    desc: "Instant feedback in practice mode, or strict exam conditions that mirror the real test hall.",
  },
  {
    icon: Upload,
    title: "Custom question bank",
    desc: "Upload your own CSV question sets or build a personal library for revision.",
  },
  {
    icon: BarChart2,
    title: "Performance analytics",
    desc: "Accuracy trends, weak topics, streak tracking, and per-subject score breakdowns.",
  },
];

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.5, delay },
  };
}

export default function GovExams() {
  usePageMeta({
    title: `${PRODUCT_NAMES.govExams} — UPSC, SSC, IBPS & more | ${PRODUCT_NAMES.brand}`,
    description:
      "Timed MCQ mock tests for UPSC CSE, SSC CGL, IBPS PO, JEE, NEET, and PSU exams. Official previous year papers, question palette, and performance analytics.",
    keywords: seoPageByPath("/gov-exams")?.keywords,
    canonical: `${PUBLIC_WEBSITE_URL}/gov-exams`,
  });

  return (
    <MarketingLayout>
      <LazyMotion features={domAnimation} strict>
      <section className="pt-8 sm:pt-12 pb-12 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <m.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-xs font-medium text-amber-600 mb-5">
              <Landmark className="w-3.5 h-3.5" />
              UPSC · SSC · IBPS · JEE · NEET · PSU
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              Government & competitive exam{" "}
              <span className="bg-gradient-to-r from-amber-400 to-primary bg-clip-text text-transparent">
                mock tests
              </span>
            </h1>
            <p className="mt-4 text-sm md:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Full-length timed MCQ sessions built for UPSC, SSC, banking, engineering, and medical
              entrance exams — with official previous year papers and a live question palette.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Start practicing free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/login"
                className="text-sm font-medium px-5 py-2.5 rounded-xl border border-border hover:bg-secondary/60 transition-all"
              >
                Log in to mock test hub
              </Link>
            </div>
          </m.div>

          <m.div {...fadeUp(0.1)}>
            <GovExamShowcase />
          </m.div>
        </div>
      </section>

      <section className="py-14 px-4 sm:px-6 bg-secondary/20">
        <div className="max-w-5xl mx-auto">
          <m.h2 {...fadeUp()} className="text-2xl font-bold text-center mb-10">
            Supported exam types
          </m.h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {EXAM_TYPES.map((exam, i) => (
              <m.div
                key={exam.name}
                {...fadeUp(i * 0.06)}
                className="rounded-2xl border border-border bg-card p-5"
              >
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
                  {exam.badge}
                </span>
                <h3 className="font-bold mt-2">{exam.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{exam.subjects}</p>
              </m.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <m.h2 {...fadeUp()} className="text-2xl font-bold text-center mb-3">
            Built for serious exam prep
          </m.h2>
          <p className="text-sm text-muted-foreground text-center mb-10 max-w-lg mx-auto">
            Everything you need to simulate the real exam hall — not just flashcards.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {FEATURES.map((f, i) => (
              <m.div
                key={f.title}
                {...fadeUp(i * 0.08)}
                className="flex gap-4 rounded-2xl border border-border bg-card p-5"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                  <f.icon className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{f.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.desc}</p>
                </div>
              </m.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 px-4 sm:px-6 border-t border-border">
        <div className="max-w-3xl mx-auto text-center">
          <m.div {...fadeUp()}>
            <h2 className="text-xl font-bold mb-4">Also preparing for job interviews?</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Career Pilot combines gov exam mock tests with AI interview coaching, mock sessions,
              and a full prep lab — one account for every stage of your career.
            </p>
            <div className="flex flex-wrap justify-center gap-3 text-xs">
              {["Practice Coach", "Mock Interviews", "Prep Lab", "Analytics"].map((label) => (
                <span
                  key={label}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card",
                  )}
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  {label}
                </span>
              ))}
            </div>
            <Link
              to="/"
              className="inline-flex items-center gap-2 mt-8 text-sm font-medium text-primary hover:underline"
            >
              Explore all features
              <ArrowRight className="w-4 h-4" />
            </Link>
          </m.div>
        </div>
      </section>
      </LazyMotion>
    </MarketingLayout>
  );
}
