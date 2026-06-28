import { useCallback } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { Camera, Loader2, Crop } from "lucide-react";
import { cn } from "@/lib/utils";
import { SERVER_AI_CREDIT_COSTS } from "@/lib/billing/creditsManager";
import { isCaptureBlockedByNetwork } from "@/lib/overlay/captureGating";

// ─────────────────────────────────────────────────────────────────
// LiveCodingProblemCapture
// Screen capture → region select → full AI answer (via useLiveCopilot).
// ─────────────────────────────────────────────────────────────────

interface LiveCodingProblemCaptureProps {
  disabled?: boolean;
  className?: string;
  /** When true, show compact "Adjust region" instead of full capture. */
  adjustRegion?: boolean;
}

export function LiveCodingProblemCapture({
  disabled,
  className,
  adjustRegion = false,
}: LiveCodingProblemCaptureProps) {
  const is_screenshot_loading = useOverlayStore((s) => s.is_screenshot_loading);
  const hasRecropSource = useOverlayStore((s) => s.has_recrop_source);
  const networkColor = useOverlayStore((s) => s.network_color);
  const offlineBlocked = networkColor === "red" || isCaptureBlockedByNetwork();

  const handleCapture = useCallback(async () => {
    if (is_screenshot_loading || disabled || offlineBlocked) return;

    const store = useOverlayStore.getState();
    const handler = adjustRegion ? store.adjust_region_handler : store.capture_coding_handler;
    if (handler) {
      handler();
      return;
    }
    store.setError("Start a Practice Coach session before capturing the screen.");
  }, [adjustRegion, disabled, is_screenshot_loading, offlineBlocked]);

  const creditCost = SERVER_AI_CREDIT_COSTS.screenshotAnswer;
  const isAdjust = adjustRegion && hasRecropSource;

  return (
    <button
      type="button"
      onClick={handleCapture}
      disabled={disabled || is_screenshot_loading || offlineBlocked || (adjustRegion && !hasRecropSource)}
      className={cn(
        "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all active:scale-95",
        "bg-brand-500/10 border-brand-500/20 text-brand-300",
        "hover:bg-brand-500/20 hover:border-brand-500/30",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
      title={
        offlineBlocked
          ? "Offline — capture paused until connection returns"
          : isAdjust
            ? `Adjust region without re-sharing (${creditCost} credits)`
            : `Capture coding problem (${creditCost} credits, Ctrl+Shift+C)`
      }
      aria-label={isAdjust ? "Adjust capture region" : "Capture coding problem"}
    >
      {is_screenshot_loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : isAdjust ? (
        <Crop className="h-3.5 w-3.5" />
      ) : (
        <Camera className="h-3.5 w-3.5" />
      )}
      {is_screenshot_loading
        ? "Generating…"
        : isAdjust
          ? "Adjust region"
          : `Capture (${creditCost} cr)`}
    </button>
  );
}
