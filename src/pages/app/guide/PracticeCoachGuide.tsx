import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Mic, Keyboard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContent } from "@/components/layout/PageContent";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";

const OverlaySetupGuidePanel = lazy(async () => {
  const mod = await import("@/components/overlay/OverlaySetupGuidePanel");
  return { default: mod.OverlaySetupGuidePanel };
});

/** Authenticated-only Practice Coach install & troubleshooting guide. */
export default function PracticeCoachGuide() {
  return (
    <PageContent className="max-w-3xl mx-auto space-y-6 pb-8">
      <div className="flex items-center gap-3">
        <Link
          to="/app/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Dashboard
        </Link>
      </div>

      <PageHeader
        title="Practice Coach setup"
        description="Install the overlay, configure microphone and system audio, and review visibility rules before your first session."
        breadcrumbs={[
          { label: "App", href: "/app/dashboard" },
          { label: "Practice Coach setup" },
        ]}
        className="mb-0"
      />

      <Suspense fallback={<SkeletonCard />}>
        <Card className="p-4">
          <OverlaySetupGuidePanel />
        </Card>
      </Suspense>

      <div className="flex flex-wrap gap-2">
        <Link
          to="/app/settings/audio"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/60 px-3 py-2 text-sm font-medium hover:bg-secondary transition-colors"
        >
          <Mic className="w-4 h-4" />
          Audio settings
        </Link>
        <Link
          to="/app/settings/hotkeys"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/60 px-3 py-2 text-sm font-medium hover:bg-secondary transition-colors"
        >
          <Keyboard className="w-4 h-4" />
          Keyboard shortcuts
        </Link>
        <Link
          to="/app/live"
          className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/15 transition-colors"
        >
          Start Practice Coach
        </Link>
      </div>
    </PageContent>
  );
}
