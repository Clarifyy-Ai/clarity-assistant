import { Link } from "react-router-dom";
import { usePageMeta } from "@/hooks/usePageMeta";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { Briefcase, Mail } from "lucide-react";
import { SALES_EMAIL, SUPPORT_EMAIL } from "@/lib/constants/contact";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { useEffect } from "react";

const SITE_URL = "https://clarify.ai.sltfinanceindia.com";

/**
 * Honest careers surface for TC-PUB-014 — no fake open roles or broken "Apply" CTAs.
 */
export default function Careers() {
  usePageMeta({
    title: `Careers — ${PRODUCT_NAMES.brand}`,
    description: "Career opportunities at Career Pilot. We currently have no open public roles.",
    canonical: `${SITE_URL}/careers`,
  });

  useEffect(() => {
  }, []);

  return (
    <MarketingLayout>
      <div className="max-w-2xl mx-auto px-4 py-16 space-y-8">
        <div className="space-y-3 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary mx-auto">
            <Briefcase className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Careers</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Thanks for your interest in joining {PRODUCT_NAMES.brand}.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
          <h2 className="text-base font-semibold text-foreground">No open roles right now</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We are not hiring for public positions at this time. This page is
            intentional — there are no hidden job listings or placeholder Apply
            buttons that claim openings we do not have.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            If you believe there is a strong fit for a future role, you can reach
            us at{" "}
            <a
              href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent("Careers inquiry")}`}
              className="text-primary font-medium hover:underline inline-flex items-center gap-1"
            >
              <Mail className="w-3.5 h-3.5" />
              {SALES_EMAIL}
            </a>
            . For product support, use{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-primary font-medium hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </div>
      </div>
    </MarketingLayout>
  );
}
