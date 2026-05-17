import { useNetworkMonitor } from "@/hooks/useNetworkMonitor";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, Zap } from "lucide-react";

// ─────────────────────────────────────────────────────────────────
// LiveNetworkMonitor
// Displays network quality as a pill badge with RTT.
// Shows model override info when on degraded network.
// ─────────────────────────────────────────────────────────────────

export function LiveNetworkMonitor() {
  const monitor = useNetworkMonitor() as ReturnType<typeof useNetworkMonitor> & {
    modelOverride?: string;
    isOfflineFallback?: boolean;
  };
  const { mode, avgRTT, qualityLabel } = monitor;
  const modelOverride = monitor.modelOverride;
  const isOfflineFallback = monitor.isOfflineFallback;

  // Format RTT text safely
  const rttText = typeof avgRTT === "number" && isFinite(avgRTT)
    ? `${Math.round(avgRTT)}ms`
    : (mode === "offline" ? "Offline" : (qualityLabel ?? "—"));

  // Map mode to styles defensively
  const badgeClass = cn(
    "flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border transition-colors",
    mode === "strong"
      ? "bg-success/10 border-success/20 text-success"
      : mode === "degraded"
      ? "bg-warning/10 border-warning/20 text-warning"
      : "bg-destructive/10 border-destructive/20 text-destructive"
  );

  const Icon = mode === "offline" ? WifiOff : Wifi;

  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <span className={badgeClass} title={qualityLabel ?? undefined}>
        <Icon className="h-3 w-3" />
        {rttText}
      </span>

      {modelOverride && mode === "degraded" && (
        <span className="flex items-center gap-1 font-mono text-[10px] text-warning/60">
          <Zap className="h-2.5 w-2.5" />
          Auto: {modelOverride}
        </span>
      )}

      {isOfflineFallback && (
        <span className="font-mono text-[10px] text-destructive/60">
          ⚡ Template mode
        </span>
      )}
    </div>
  );
}
