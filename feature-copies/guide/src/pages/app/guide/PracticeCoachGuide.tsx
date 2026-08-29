import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { Mic, Keyboard, Headphones, ListChecks, Monitor, Wrench } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";

const OverlaySetupGuidePanel = lazy(async () => {
  const mod = await import("@/components/overlay/OverlaySetupGuidePanel");
  return { default: mod.OverlaySetupGuidePanel };
});

const SECTION_LINKS = [
  { hash: "system-checklist", label: "System checklist", icon: ListChecks },
  { hash: "desktop-install", label: "Desktop install", icon: Monitor },
  { hash: "troubleshooting", label: "Troubleshooting", icon: Wrench },
] as const;

/** Authenticated-only Practice Coach install & troubleshooting guide. */
export default function PracticeCoachGuide() {
  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-10">
      <PageHeader
        title="Practice Coach setup"
        description="Install the overlay, configure microphone and system audio, and review visibility rules before your first session."
        breadcrumbs={[
          { label: PRODUCT_NAMES.dashboard, href: "/app/dashboard" },
          { label: "Practice Coach setup" },
        ]}
        className="mb-0"
      />

      <nav
        aria-label="Guide sections"
        className="flex flex-wrap gap-2 rounded-2xl border border-border bg-secondary/40 p-2.5"
      >
        {SECTION_LINKS.map(({ hash, label, icon: Icon }) => (
          <a
            key={hash}
            href={`#${hash}`}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(hash);
              if (!el) return;
              el.scrollIntoView({ behavior: "smooth", block: "start" });
              window.history.replaceState(null, "", `#${hash}`);
            }}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {label}
          </a>
        ))}
      </nav>

      <Suspense fallback={<SkeletonCard />}>
        <Card className="p-4 sm:p-5 overflow-hidden">
          <OverlaySetupGuidePanel />
        </Card>
      </Suspense>

      <section aria-label="Related settings" className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Next steps</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/app/settings/practice-coach"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/60 px-3 py-2.5 text-sm font-medium hover:bg-secondary transition-colors"
          >
            <Headphones className="w-4 h-4 shrink-0" />
            Practice Coach settings
          </Link>
          <Link
            to="/app/settings/audio"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/60 px-3 py-2.5 text-sm font-medium hover:bg-secondary transition-colors"
          >
            <Mic className="w-4 h-4 shrink-0" />
            Audio settings
          </Link>
          <Link
            to="/app/settings/hotkeys"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/60 px-3 py-2.5 text-sm font-medium hover:bg-secondary transition-colors"
          >
            <Keyboard className="w-4 h-4 shrink-0" />
            Keyboard shortcuts
          </Link>
          <Link
            to="/app/live"
            className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/15 transition-colors"
          >
            Start Practice Coach
          </Link>
        </div>
      </section>
    </div>
  );
}
