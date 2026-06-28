import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Monitor, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
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
    <div className={cn("space-y-4", className)}>
      <div className="flex gap-2.5 rounded-xl border border-indigo-500/25 bg-indigo-500/8 px-3 py-2.5">
        <AlertTriangle className="w-4 h-4 text-indigo-300 shrink-0 mt-0.5" aria-hidden="true" />
        <p className={cn("text-indigo-100/90 leading-relaxed", compact ? "text-[11px]" : "text-xs")}>
          <span className="font-semibold text-indigo-100">Visible on screen share.</span>{" "}
          {OVERLAY_VISIBILITY_WARNING}
        </p>
      </div>

      <section>
        <h3 className={cn("font-semibold text-foreground flex items-center gap-2 mb-2", compact ? "text-xs" : "text-sm")}>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
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
        <section>
          <h3 className={cn("font-semibold text-foreground flex items-center gap-2 mb-2", compact ? "text-xs" : "text-sm")}>
            <Monitor className="w-4 h-4 text-blue-400" />
            Desktop installation
          </h3>
          <ol className={cn("list-decimal list-inside space-y-1 text-muted-foreground", compact ? "text-[10px]" : "text-[11px]")}>
            {DESKTOP_INSTALL_STEPS.map((step) => (
              <li key={step} className="leading-relaxed">{step}</li>
            ))}
          </ol>
          <div className="mt-3">
            <DesktopDownloadButton size="sm" />
          </div>
        </section>
      )}

      {showTroubleshooting && (
        <section>
          <h3 className={cn("font-semibold text-foreground flex items-center gap-2 mb-2", compact ? "text-xs" : "text-sm")}>
            <Wrench className="w-4 h-4 text-amber-400" />
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
                  <span className="text-muted-foreground text-[10px] group-open:hidden">Show fixes</span>
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

      <p className={cn("text-muted-foreground", compact ? "text-[10px]" : "text-[11px]")}>
        Full guide (sign-in required):{" "}
        {isElectronApp() ? (
          <>
            <button
              type="button"
              onClick={() => openInBrowser("/app/guide/practice-coach")}
              className="text-primary hover:underline"
            >
              Practice Coach setup
            </button>
            {" · "}
            <button
              type="button"
              onClick={() => openInBrowser("/app/settings/practice-coach")}
              className="text-primary hover:underline"
            >
              Settings checklist
            </button>
          </>
        ) : (
          <>
            <Link to="/app/guide/practice-coach" className="text-primary hover:underline">
              Practice Coach setup
            </Link>
            {" · "}
            <Link to="/app/settings/practice-coach" className="text-primary hover:underline">
              Settings checklist
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
