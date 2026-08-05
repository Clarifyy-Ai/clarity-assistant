import { Link } from "react-router-dom";
import { Download, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { useDesktopDownload } from "@/hooks/useDesktopDownload";
import { cn } from "@/lib/utils";

interface DesktopDownloadButtonProps {
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  showGuideLink?: boolean;
  fullWidth?: boolean;
}

export function DesktopDownloadButton({
  className,
  size = "md",
  variant = "primary",
  showGuideLink = true,
  fullWidth = false,
}: DesktopDownloadButtonProps) {
  const { osLabel, url, loading, download, refresh, installGuidePath } = useDesktopDownload();

  return (
    <div className={cn("flex flex-col gap-2", fullWidth && "w-full", className)}>
      <div className={cn("flex flex-wrap gap-2", fullWidth && "w-full")}>
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
            ) : url ? (
              <ExternalLink className="w-4 h-4" />
            ) : (
              <Download className="w-4 h-4" />
            )
          }
        >
          {loading ? "Finding installer…" : url ? `Download for ${osLabel}` : `Get ${osLabel} installer`}
        </Button>

        {!loading && !url && (
          <Button
            type="button"
            variant="outline"
            size={size}
            onClick={() => void refresh()}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Retry
          </Button>
        )}
      </div>

      {!url && !loading && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 max-w-md">
          <p className="text-xs text-foreground font-medium">Desktop installer</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            The Windows installer isn&apos;t published for this environment yet. You can keep using
            Practice Coach in the browser, or open the{" "}
            <Link to="/app/guide/practice-coach" className="text-primary hover:underline">
              Practice Coach guide
            </Link>{" "}
            for setup tips.
          </p>
          {import.meta.env.DEV && (
            <p className="text-[10px] text-muted-foreground/80 leading-relaxed font-mono">
              Dev: set VITE_DESKTOP_DOWNLOAD_URL_WIN or run npm run publish:desktop-installer.
            </p>
          )}
        </div>
      )}

      {url && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Windows SmartScreen may warn on first install until the build is code-signed. Choose{" "}
          <strong className="text-foreground">More info → Run anyway</strong> if you trust this release.
        </p>
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
