import { Link } from "react-router-dom";
import { Download, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { useDesktopDownload } from "@/hooks/useDesktopDownload";
import { cn } from "@/lib/utils";

interface DesktopDownloadButtonProps {
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  showGuideLink?: boolean;
  fullWidth?: boolean;
  /** Hide verbose SmartScreen / unpublished copy (dashboard cards). */
  compact?: boolean;
  /** When installer is unpublished, primary path for Practice Coach. */
  webCoachHref?: string;
}

export function DesktopDownloadButton({
  className,
  size = "md",
  variant = "primary",
  showGuideLink = true,
  fullWidth = false,
  compact = false,
  webCoachHref = "/app/live",
}: DesktopDownloadButtonProps) {
  const { osLabel, url, loading, download, installGuidePath } = useDesktopDownload();

  return (
    <div className={cn("flex flex-col gap-2 min-w-0", fullWidth && "w-full", className)}>
      {url ? (
        <>
          <Button
            type="button"
            variant={variant}
            size={size}
            fullWidth={fullWidth}
            disabled={loading}
            onClick={() => void download()}
              leftIcon={
                loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )
              }
          >
            {loading ? "Finding installer…" : `Download for ${osLabel}`}
          </Button>
          {!compact && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Windows SmartScreen may warn on first install until the build is code-signed. Choose{" "}
              <strong className="text-foreground">More info → Run anyway</strong> if you trust this
              release.
            </p>
          )}
        </>
      ) : (
        <div className="space-y-2 min-w-0">
          <Link
            to={webCoachHref}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all min-h-11",
              variant === "primary"
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "bg-secondary text-foreground hover:bg-secondary/80 border border-border",
              fullWidth && "w-full",
            )}
          >
            Continue in web Practice Coach
          </Link>
          {!loading && !compact && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 max-w-md">
              <p className="text-xs text-foreground font-medium">Desktop installer</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                The {osLabel} installer isn&apos;t published for this environment yet. This is not a
                temporary outage — use web Practice Coach above. Download appears only when a real
                installer artifact is configured.
              </p>
              {import.meta.env.DEV && (
                <p className="text-[10px] text-muted-foreground/80 leading-relaxed font-mono">
                  Dev: set VITE_DESKTOP_DOWNLOAD_URL_WIN or run npm run publish:desktop-installer.
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                leftIcon={<Download className="w-3.5 h-3.5" />}
              >
                Get {osLabel} installer (unavailable)
              </Button>
            </div>
          )}
          {loading && (
            <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking for desktop installer…
            </p>
          )}
        </div>
      )}

      {showGuideLink && (
        <Link
          to={installGuidePath}
          className="text-xs text-primary hover:underline w-fit"
        >
          Full install & troubleshooting guide
        </Link>
      )}
    </div>
  );
}
