import { useOverlayStore } from "@/store/overlayStore";
import { PANIC_RESPONSE } from "@/types/session.types";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// LivePanicButton
// 🆘 Always-visible panic button. Zero latency, deterministic.
// Shows calming steps instantly — no AI call, no network required.
// ─────────────────────────────────────────────────────────────────

interface LivePanicButtonProps {
  className?: string;
}

export function LivePanicButton({ className }: LivePanicButtonProps) {
  // Only pull actions — stable references, no re-renders from state changes
  const showPanic  = useOverlayStore((s) => s.showPanic);
  const showOverlay = useOverlayStore((s) => s.showOverlay);

  function handlePanic() {
    showPanic(PANIC_RESPONSE);
    showOverlay();
  }

  return (
    <button
      type="button"
      onClick={handlePanic}
      className={cn(
        "flex items-center justify-center gap-1.5",
        "px-3 py-2 rounded-xl text-xs font-semibold",
        "bg-destructive/10 border border-destructive/20 text-destructive",
        "hover:bg-destructive/20 hover:border-destructive/30",
        "transition-all active:scale-95",
        className
      )}
      title="Panic — show calming steps instantly (Ctrl+Shift+P)"
      aria-label="Show panic guidance now"
    >
      🆘 Panic
    </button>
  );
}
