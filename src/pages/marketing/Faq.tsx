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
import { PUBLIC_CTAS } from "@/lib/constants/publicCtas";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { PUBLIC_WEBSITE_URL } from "@/lib/constants/contact";
import { seoPageByPath } from "@/lib/seo/publicPages";
import {
  HELP_CREDITS_OVERVIEW_ANSWER,
  HELP_PAID_PLANS_ANSWER,
} from "@/lib/help/helpCatalogCopy";

const SITE_URL = PUBLIC_WEBSITE_URL;

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What is Career Pilot?",
    a: `${PRODUCT_NAMES.brand} is an interview and exam-prep practice product: ${PRODUCT_NAMES.practiceCoach}, ${PRODUCT_NAMES.mockInterview} scorecards, ${PRODUCT_NAMES.prepLab} tools, and ${PRODUCT_NAMES.govExams}. It is for rehearsal — not for a live employer interview or a proctored exam.`,
  },
  {
    q: "How do credits work?",
    a: HELP_CREDITS_OVERVIEW_ANSWER,
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
    a: HELP_PAID_PLANS_ANSWER,
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
    keywords: seoPageByPath("/faq")?.keywords,
    canonical: `${SITE_URL}/faq`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.map((faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: { "@type": "Answer", text: faq.a },
      })),
    },
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
              {PUBLIC_CTAS.help}
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
      </div>
    </MarketingLayout>
  );
}
