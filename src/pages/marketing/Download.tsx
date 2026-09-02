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
      <div className="max-w-2xl mx-auto px-4 py-16 space-y-8">
        <div className="space-y-3 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary mx-auto">
            <Monitor className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Download Career Pilot</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Install the Windows app for Practice Coach overlay, microphone, and global shortcuts.
            Sign in with the same account you use on trycareerpilot.com. Mock interviews, exams,
            billing, and the rest of the product open in your browser.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-base font-semibold text-foreground">Windows installer</h2>
          <DesktopDownloadButton showGuideLink fullWidth />
        </div>
      </div>
    </MarketingLayout>
  );
}
