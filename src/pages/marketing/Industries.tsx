import { Link } from "react-router-dom";
import { usePageMeta } from "@/hooks/usePageMeta";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { Landmark } from "lucide-react";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";

const SITE_URL = "https://clarify.ai.sltfinanceindia.com";

/**
 * Honest industries surface for TC-PUB-014 — no customer logos or invented case studies.
 */
export default function Industries() {
  usePageMeta({
    title: `Industries — ${PRODUCT_NAMES.brand}`,
    description:
      "Clarify AI is used for software interview practice and government exam mock tests in India. No customer logos.",
    canonical: `${SITE_URL}/industries`,
  });

  return (
    <MarketingLayout>
      <div className="max-w-2xl mx-auto px-4 py-16 space-y-8">
        <div className="space-y-3 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary mx-auto">
            <Landmark className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Industries</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We serve two practice use cases. This is not a customer-logo wall.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
          <h2 className="text-base font-semibold text-foreground">
            {PRODUCT_NAMES.interviewPractice}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Software and other professional interviews: behavioral (STAR), technical
            coding, and system design. {PRODUCT_NAMES.practiceCoach} and{" "}
            {PRODUCT_NAMES.mockInterview} are built for rehearsal with an AI coach —
            not for a live employer round.
          </p>
          <Link to="/#features" className="text-sm text-primary font-medium hover:underline">
            See interview features
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
          <h2 className="text-base font-semibold text-foreground">
            {PRODUCT_NAMES.govExamPrep}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Timed MCQ mock tests aimed at government and entrance exams in India,
            including UPSC CSE, SSC CGL, IBPS PO, JEE Main, NEET UG, and PSU-style
            papers. Coverage depends on papers in the bank — we do not claim every
            board or year is available.
          </p>
          <Link to="/gov-exams" className="text-sm text-primary font-medium hover:underline">
            {PRODUCT_NAMES.govExams}
          </Link>
        </div>

        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          We do not publish customer names or logos on this page.
        </p>

        <div className="flex flex-wrap justify-center gap-3 text-sm">
          <Link to="/about" className="text-primary font-medium hover:underline">
            About
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link to="/pricing" className="text-primary font-medium hover:underline">
            Pricing
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link to="/" className="text-primary font-medium hover:underline">
            Home
          </Link>
        </div>
      </div>
    </MarketingLayout>
  );
}
