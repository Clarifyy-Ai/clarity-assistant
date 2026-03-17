import { useNetworkMonitor } from "@/hooks/useNetworkMonitor";
import { WifiOff, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// NetworkBanner
// Full-width warning shown when network is degraded or offline.
// ─────────────────────────────────────────────────────────────────

export function NetworkBanner() {
  const { mode, rttMs } = useNetworkMonitor();

  if (mode === "strong") return null;

  return (
    <div
      className={cn(
        "fixed top-14 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium",
        mode === "offline"
          ? "bg-red-600/90 text-white"
          : "bg-amber-500/90 text-black"
      )}
    >
      {mode === "offline" ? (
        <><WifiOff className="w-3.5 h-3.5" /> Offline — serving cached answers</>
      ) : (
        <><AlertTriangle className="w-3.5 h-3.5" /> Slow network ({rttMs}ms) — using fast mode</>
      )}
    </div>
  );
}
