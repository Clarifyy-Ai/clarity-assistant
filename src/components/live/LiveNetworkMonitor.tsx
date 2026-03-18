import { useNetworkMonitor } from "@/hooks/useNetworkMonitor";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, Zap } from "lucide-react";

// ─────────────────────────────────────────────────────────────────
// LiveNetworkMonitor
// Displays network quality as a pill badge with RTT.
// Shows model override info when on degraded network.
// ─────────────────────────────────────────────────────────────────

export function LiveNetworkMonitor() {
  const { mode, avgRTT, modelOverride, qualityLabel, isOfflineFallback } = useNetworkMonitor();

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border transition-colors",
          mode === "strong"
            ? "bg-success/10 border-success/20 text-success"
            : mode === "degraded"
            ? "bg-warning/10 border-warning/20 text-warning"
            : "bg-destructive/10 border-destructive/20 text-destructive"
        )}
      >
        {mode === "offline" ? (
          <WifiOff className="w-3 h-3" />
        ) : (
          <Wifi className="w-3 h-3" />
        )}
        {mode === "offline" ? "Offline" : `${avgRTT}ms`}
      </span>

      {modelOverride && mode === "degraded" && (
        <span className="flex items-center gap-1 text-[10px] text-warning/60 font-mono">
          <Zap className="w-2.5 h-2.5" />
          Auto: {modelOverride}
        </span>
      )}

      {isOfflineFallback && (
        <span className="text-[10px] text-destructive/60 font-mono">
          ⚡ Template mode
        </span>
      )}
    </div>
  );
}
