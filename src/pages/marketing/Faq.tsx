import { Link } from "react-router-dom";
import { usePageMeta } from "@/hooks/usePageMeta";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { HelpCircle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import {
  CREDIT_PACK_DEFINITIONS,
  PLAN_MONTHLY_CREDITS,
} from "@/lib/constants/creditEconomics";

const SITE_URL = "https://clarify.ai.sltfinanceindia.com";

const FREE_CREDITS = PLAN_MONTHLY_CREDITS.free;
const PRO_CREDITS = PLAN_MONTHLY_CREDITS.pro;
const MAX_CREDITS = PLAN_MONTHLY_CREDITS.enterprise;
const PACK_LIST = CREDIT_PACK_DEFINITIONS.map((p) => `${p.credits}`).join(", ");

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What is Career Pilot?",
    a: `${PRODUCT_NAMES.brand} is an interview and exam-prep practice product: ${PRODUCT_NAMES.practiceCoach}, ${PRODUCT_NAMES.mockInterview} scorecards, ${PRODUCT_NAMES.prepLab} tools, and ${PRODUCT_NAMES.govExams}. It is for rehearsal — not for a live employer interview or a proctored exam.`,
  },
  {
    q: "How do credits work?",
    a: `Credits pay for AI-powered actions. Free includes ${FREE_CREDITS} credits per month. Pro includes ${PRO_CREDITS} credits (one-time). Max includes ${MAX_CREDITS} credits (one-time). Extra packs (${PACK_LIST} credits) are sold from Settings → Billing.`,
  },
  {
    q: "How does Practice Coach work?",
    a: `${PRODUCT_NAMES.practiceCoach} listens during a practice session and shows talking-point hints, structure cues, and follow-ups in an on-screen overlay. The overlay is a normal window and is visible to screen-sharing tools.`,
  },
  {
    q: "Can I use this during a real interview?",
    a: "No. Using AI assistance covertly during a real interview or a proctored assessment violates most employer and exam policies. Career Pilot is built for practice only.",
  },
  {
    q: "What government exams can I practice?",
    a: `${PRODUCT_NAMES.govExams} covers timed MCQ papers for exams such as UPSC CSE, SSC CGL, IBPS PO, JEE Main, NEET UG, and PSU-style sets when those papers are in the bank. Availability is per exam and paper — we do not claim every year is online.`,
  },
  {
    q: "How much do paid plans cost?",
    a: `Pro is ₹2,499 one-time (${PRO_CREDITS.toLocaleString()} credits). Max is ₹6,799 one-time (${MAX_CREDITS.toLocaleString()} credits). Pay in INR with Razorpay — checkout does not auto-renew.`,
  },
];

/**
 * Product FAQ for TC-PUB-014 — real credits, gov exams, Practice Coach, billing. Deep articles live in Help.
 */
export default function Faq() {
  usePageMeta({
    title: `FAQ — ${PRODUCT_NAMES.brand}`,
    description:
      "Answers about Career Pilot credits, Practice Coach, government exam mocks, and billing. More articles in Help.",
    canonical: `${SITE_URL}/faq`,
  });

  return (
    <MarketingLayout>
      <div className="max-w-2xl mx-auto px-4 py-16 space-y-8">
        <div className="space-y-3 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary mx-auto">
            <HelpCircle className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">FAQ</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Short answers from the product. Longer articles are in the{" "}
            <Link to="/help" className="text-primary font-medium hover:underline">
              Help Center
            </Link>
            .
          </p>
        </div>

        <Accordion
          type="single"
          collapsible
          className="w-full rounded-2xl border border-border bg-card overflow-hidden"
        >
          {FAQS.map((faq, i) => (
            <AccordionItem
              key={faq.q}
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

        <div className="flex flex-wrap justify-center gap-3 text-sm">
          <Link to="/help" className="text-primary font-medium hover:underline">
            Help Center
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
