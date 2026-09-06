import { Monitor } from "lucide-react";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { usePageMeta } from "@/hooks/usePageMeta";
import { DesktopDownloadButton } from "@/components/common/DesktopDownloadButton";
import { PUBLIC_WEBSITE_URL } from "@/lib/constants/contact";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { PUBLIC_CTAS } from "@/lib/constants/publicCtas";

const SITE_URL = PUBLIC_WEBSITE_URL;

export default function Download() {
  usePageMeta({
    title: `${PUBLIC_CTAS.downloadDesktop} — ${PRODUCT_NAMES.brand}`,
    description:
      "Download the Career Pilot Windows app for Practice Coach overlay sessions. Dashboard, mock interviews, exams, and billing stay on the website.",
    canonical: `${SITE_URL}/download`,
  });

  return (
    <MarketingLayout>
      <section className="pt-4 sm:pt-10 pb-14 sm:pb-16 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-primary/10 text-primary mx-auto mb-3">
              <Monitor className="w-5 h-5" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
              Download Career Pilot
            </h1>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-lg mx-auto">
              Install the Windows app for Practice Coach overlay, microphone, and global shortcuts.
              Sign in with the same account you use on trycareerpilot.com. Mock interviews, exams,
              billing, and the rest of the product open in your browser.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="text-base font-semibold text-foreground mb-3">Windows installer</h2>
            <DesktopDownloadButton showGuideLink fullWidth />
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
