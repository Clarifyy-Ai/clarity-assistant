import { Link } from "react-router-dom";
import { usePageMeta } from "@/hooks/usePageMeta";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { Info } from "lucide-react";
import { LEGAL_ENTITY_NAME, SUPPORT_EMAIL } from "@/lib/constants/contact";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";

const SITE_URL = "https://clarify.ai.sltfinanceindia.com";

/**
 * Honest About page for TC-PUB-014 — no team bios, headcount, or invented metrics.
 */
export default function About() {
  usePageMeta({
    title: `About — ${PRODUCT_NAMES.brand}`,
    description:
      "Career Pilot is a practice product for software interviews and government exam mock tests. Operated by Payara Labs.",
    canonical: `${SITE_URL}/about`,
  });

  return (
    <MarketingLayout>
      <div className="max-w-2xl mx-auto px-4 py-16 space-y-8">
        <div className="space-y-3 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary mx-auto">
            <Info className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">About</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {PRODUCT_NAMES.brand} is a practice product for interview rehearsal and
            government exam mock tests.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
          <h2 className="text-base font-semibold text-foreground">What we build</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {PRODUCT_NAMES.brand} helps you rehearse — not sit a live interview or a
            proctored exam. The product includes {PRODUCT_NAMES.practiceCoach} (live
            talking-point hints in an on-screen overlay), {PRODUCT_NAMES.mockInterview}{" "}
            sessions with scorecards, {PRODUCT_NAMES.prepLab} tools, and{" "}
            {PRODUCT_NAMES.govExams} for timed MCQ practice.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Using AI assistance during a real interview or a proctored assessment
            violates most employer and exam policies. The overlay is a normal window
            and is visible to screen-sharing tools.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
          <h2 className="text-base font-semibold text-foreground">Who operates it</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {PRODUCT_NAMES.brand} is operated by {LEGAL_ENTITY_NAME}. This page does
            not list team bios, funding, or user counts — we do not publish those
            figures here.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            For product questions, email{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-primary font-medium hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
            . Teams evaluating Pro or Max can use{" "}
            <Link to="/contact-sales" className="text-primary font-medium hover:underline">
              Contact Sales
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3 text-sm">
          <Link to="/industries" className="text-primary font-medium hover:underline">
            Industries
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link to="/careers" className="text-primary font-medium hover:underline">
            Careers
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
