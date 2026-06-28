import { useOverlayStore } from "@/store/overlayStore";
import { PANIC_RESPONSE } from "@/types/session.types";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// CalmStepsButton — instant breathing / structure prompts (not overlay hiding).
// Shows calming steps instantly — no AI call, no network required.
// ─────────────────────────────────────────────────────────────────

interface CalmStepsButtonProps {
  className?: string;
}

export function CalmStepsButton({ className }: CalmStepsButtonProps) {
  const showPanic = useOverlayStore((s) => s.showPanic);
  const showOverlay = useOverlayStore((s) => s.showOverlay);

  function handleCalmSteps() {
    showPanic(PANIC_RESPONSE);
    showOverlay();
  }

  return (
    <button
      type="button"
      onClick={handleCalmSteps}
      className={cn(
        "flex items-center justify-center gap-1.5",
        "px-3 py-2 rounded-xl text-xs font-semibold",
        "bg-destructive/10 border border-destructive/20 text-destructive",
        "hover:bg-destructive/20 hover:border-destructive/30",
        "transition-all active:scale-95",
        className
      )}
      title="Calm steps — grounding prompts (Ctrl+Shift+P)"
      aria-label="Show calm coaching steps now"
    >
      Calm steps
    </button>
  );
}
