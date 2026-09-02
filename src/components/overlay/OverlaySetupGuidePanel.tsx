import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Monitor, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdvisoryBanner } from "@/components/common/AdvisoryBanner";
import { DesktopDownloadButton } from "@/components/common/DesktopDownloadButton";
import { isElectronApp } from "@/lib/platform/isElectron";
import { openInBrowser } from "@/lib/platform/openInBrowser";
import {
  DESKTOP_INSTALL_STEPS,
  OVERLAY_SYSTEM_CHECKLIST,
  OVERLAY_TROUBLESHOOTING,
  OVERLAY_VISIBILITY_WARNING,
} from "@/lib/constants/overlaySetupGuide";

interface OverlaySetupGuidePanelProps {
  className?: string;
  compact?: boolean;
  showDesktopInstall?: boolean;
  showTroubleshooting?: boolean;
}

export function OverlaySetupGuidePanel({
  className,
  compact = false,
  showDesktopInstall = true,
  showTroubleshooting = true,
}: OverlaySetupGuidePanelProps) {
  return (
    <div className={cn("space-y-6", className)}>
      <AdvisoryBanner
        icon={AlertTriangle}
        title="Visible on screen share."
        compact={compact}
      >
        {OVERLAY_VISIBILITY_WARNING}
      </AdvisoryBanner>

      <section id="system-checklist" className="scroll-mt-24 space-y-3">
        <h3 className={cn("font-semibold text-foreground flex items-center gap-2", compact ? "text-xs" : "text-sm")}>
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          System settings checklist
        </h3>
        <ul className="space-y-2">
          {OVERLAY_SYSTEM_CHECKLIST.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-border bg-secondary/30 px-3 py-2.5"
            >
              <p className={cn("font-medium text-foreground", compact ? "text-[11px]" : "text-xs")}>
                {item.title}
              </p>
              <p className={cn("text-muted-foreground mt-0.5 leading-relaxed", compact ? "text-[10px]" : "text-[11px]")}>
                {item.detail}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {showDesktopInstall && (
        <section id="desktop-install" className="scroll-mt-24 space-y-3 pt-2 border-t border-border">
          <h3 className={cn("font-semibold text-foreground flex items-center gap-2", compact ? "text-xs" : "text-sm")}>
            <Monitor className="w-4 h-4 text-blue-400 shrink-0" />
            Desktop installation
          </h3>
          <ol className={cn("list-decimal list-inside space-y-1.5 text-muted-foreground", compact ? "text-[10px]" : "text-[11px]")}>
            {DESKTOP_INSTALL_STEPS.map((step) => (
              <li key={step} className="leading-relaxed">{step}</li>
            ))}
          </ol>
          <div className="pt-1">
            <DesktopDownloadButton size="sm" />
          </div>
        </section>
      )}

      {showTroubleshooting && (
        <section id="troubleshooting" className="scroll-mt-24 space-y-3 pt-2 border-t border-border">
          <h3 className={cn("font-semibold text-foreground flex items-center gap-2", compact ? "text-xs" : "text-sm")}>
            <Wrench className="w-4 h-4 text-amber-400 shrink-0" />
            Troubleshooting
          </h3>
          <div className="space-y-2">
            {OVERLAY_TROUBLESHOOTING.map((item) => (
              <details
                key={item.id}
                className="rounded-xl border border-border bg-secondary/20 px-3 py-2 group"
              >
                <summary className={cn("cursor-pointer font-medium text-foreground list-none flex items-center justify-between gap-2", compact ? "text-[11px]" : "text-xs")}>
                  {item.problem}
                  <span className="text-muted-foreground text-[10px] group-open:hidden shrink-0">Show fixes</span>
                </summary>
                <ul className={cn("mt-2 space-y-1 text-muted-foreground list-disc list-inside", compact ? "text-[10px]" : "text-[11px]")}>
                  {item.fixes.map((fix) => (
                    <li key={fix}>{fix}</li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      )}

      <p className={cn("text-muted-foreground pt-1 border-t border-border", compact ? "text-[10px]" : "text-[11px]")}>
        Related:{" "}
        {isElectronApp() ? (
          <>
            <button
              type="button"
              onClick={() => openInBrowser("/app/settings/practice-coach")}
              className="text-primary hover:underline"
            >
              Settings checklist
            </button>
            {" · "}
            <button
              type="button"
              onClick={() => openInBrowser("/app/settings/audio")}
              className="text-primary hover:underline"
            >
              Audio settings
            </button>
            {" · "}
            <button
              type="button"
              onClick={() => openInBrowser("/app/settings/hotkeys")}
              className="text-primary hover:underline"
            >
              Keyboard shortcuts
            </button>
          </>
        ) : (
          <>
            <Link to="/app/settings/practice-coach" className="text-primary hover:underline">
              Settings checklist
            </Link>
            {" · "}
            <Link to="/app/settings/audio" className="text-primary hover:underline">
              Audio settings
            </Link>
            {" · "}
            <Link to="/app/settings/hotkeys" className="text-primary hover:underline">
              Keyboard shortcuts
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
