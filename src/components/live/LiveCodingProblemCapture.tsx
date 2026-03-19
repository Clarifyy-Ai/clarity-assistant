import { useCallback } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { captureAndAnalyseCodingProblem } from "@/lib/audio/screenshotCapture";
import { Camera, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// LiveCodingProblemCapture
// Button to screenshot current screen and get AI coding analysis.
// Returns pattern, complexity, approach, and edge cases.
// ─────────────────────────────────────────────────────────────────

interface LiveCodingProblemCaptureProps {
  disabled?: boolean;
  className?: string;
}

export function LiveCodingProblemCapture({
  disabled,
  className,
}: LiveCodingProblemCaptureProps) {
  const { is_screenshot_loading, setErrorMessage } = useOverlayStore() as {
    is_screenshot_loading: boolean;
    setErrorMessage?: (msg: string) => void;
  };

  const handleCapture = useCallback(async () => {
    if (is_screenshot_loading || disabled) return;

    try {
      await captureAndAnalyseCodingProblem();
    } catch (err: any) {
      // Graceful error surface (perm denied, no active tab, etc.)
      const message =
        err?.message ||
        "Could not capture the screen. Please allow screen capture and try again.";
      setErrorMessage?.(message);
      // Optional: console for diagnostics
      // eslint-disable-next-line no-console
      console.error("[CaptureCodingProblem] failed:", err);
    }
  }, [disabled, is_screenshot_loading, setErrorMessage]);

  return (
    <button
      type="button"
      onClick={handleCapture}
      disabled={disabled || is_screenshot_loading}
      className={cn(
        "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all active:scale-95",
        // Base brand styles
        "bg-brand-500/10 border-brand-500/20 text-brand-300",
        "hover:bg-brand-500/20 hover:border-brand-500/30",
        // Disabled state
        "disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
      title="Capture coding problem (Ctrl+Shift+C)"
      aria-label="Capture coding problem"
    >
      {is_screenshot_loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Camera className="h-3.5 w-3.5" />
