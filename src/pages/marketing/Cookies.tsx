import { Link } from "react-router-dom";
import { usePageMeta } from "@/hooks/usePageMeta";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { Cookie } from "lucide-react";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { ROUTES } from "@/lib/constants/apiEndpoints";

const SITE_URL = "https://clarify.ai.sltfinanceindia.com";

/**
 * Cookie / telemetry notice for TC-PUB-014 — points at Privacy Policy and Settings → Privacy.
 */
export default function Cookies() {
  usePageMeta({
    title: `Cookies — ${PRODUCT_NAMES.brand}`,
    description:
      "How Career Pilot uses essential cookies, PostHog analytics, and Sentry crash reporting. Manage prefs in Settings → Privacy.",
    canonical: `${SITE_URL}/cookies`,
  });

  return (
    <MarketingLayout>
      <div className="max-w-2xl mx-auto px-4 py-16 space-y-8">
        <div className="space-y-3 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary mx-auto">
            <Cookie className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Cookies</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            How {PRODUCT_NAMES.brand} uses cookies and similar telemetry.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
          <h2 className="text-base font-semibold text-foreground">Essential cookies</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We use essential cookies and similar storage for authentication and
            session management so you can stay signed in. These are required for
            the product to work.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
          <h2 className="text-base font-semibold text-foreground">Analytics and crash reporting</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            When configured on a deployment, we use <strong className="text-foreground font-medium">PostHog</strong> for
            product analytics (pages and features used) and{" "}
            <strong className="text-foreground font-medium">Sentry</strong> for crash
            and error reports. Session text is omitted from those tools when you
            turn off AI-improvement consent.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
          <h2 className="text-base font-semibold text-foreground">Your choices</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A first-visit cookie notice lets you Accept or Decline. That choice is
            stored in this browser. Signed-in controls for product analytics
            (PostHog) and crash reporting (Sentry) live in{" "}
            <Link
              to={ROUTES.SETTINGS_PRIVACY}
              className="text-primary font-medium hover:underline"
            >
              Settings → Privacy
            </Link>
            .
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The full legal description is in our{" "}
            <Link to="/privacy" className="text-primary font-medium hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3 text-sm">
          <Link to="/privacy" className="text-primary font-medium hover:underline">
            Privacy Policy
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link to="/terms" className="text-primary font-medium hover:underline">
            Terms
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
