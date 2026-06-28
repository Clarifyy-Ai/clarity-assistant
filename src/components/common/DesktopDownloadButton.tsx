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
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <p className="text-xs text-foreground font-medium">Installer not hosted yet</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            If you built locally, run{" "}
            <code className="text-[10px]">npm run install:desktop</code> in the project folder,
            or open <code className="text-[10px]">release-new\Clarify AI Setup 1.0.0.exe</code> directly.
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            For production: upload the .exe with{" "}
            <code className="text-[10px]">npm run publish:desktop-installer</code>, set{" "}
            <code className="text-[10px]">VITE_DESKTOP_DOWNLOAD_URL_WIN</code>, then redeploy.
          </p>
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
