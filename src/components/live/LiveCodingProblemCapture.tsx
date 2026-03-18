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

export function LiveCodingProblemCapture({ disabled, className }: LiveCodingProblemCaptureProps) {
  const { is_screenshot_loading } = useOverlayStore();

  async function handleCapture() {
    if (is_screenshot_loading || disabled) return;
    await captureAndAnalyseCodingProblem();
  }

  return (
    <button
      onClick={handleCapture}
      disabled={disabled || is_screenshot_loading}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium",
        "bg-brand-500/10 border border-brand-500/20 text-brand-300",
        "hover:bg-brand-500/20 hover:border-brand-500/30",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        "transition-all active:scale-95",
        className
      )}
      title="Capture coding problem (Ctrl+Shift+C)"
    >
      {is_screenshot_loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Camera className="w-3.5 h-3.5" />
      )}
      {is_screenshot_loading ? "Analysing…" : "Capture Code"}
    </button>
  );
}
