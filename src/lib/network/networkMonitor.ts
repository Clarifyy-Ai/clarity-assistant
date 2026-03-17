import { useNetworkStore } from "@/store/networkStore";
import { useOverlayStore } from "@/store/overlayStore";

// ─────────────────────────────────────────────────────────────────
// Network Monitor
// Continuously probes network quality and updates store.
// Drives the overlay indicator color and model auto-downgrade.
// ─────────────────────────────────────────────────────────────────

const PROBE_INTERVAL_MS  = 10_000;   // probe every 10s
const FAST_PROBE_TIMEOUT = 5_000;    // abort probe if no response in 5s

// Lightweight probe endpoint — returns HTTP 200 with minimal payload
const PROBE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ping`;

// ─────────────────────────────────────────────────────────────────
// Network Monitor class
// ─────────────────────────────────────────────────────────────────

export class NetworkMonitor {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private onlineHandler:  () => void;
  private offlineHandler: () => void;

  constructor() {
    this.onlineHandler  = () => this.handleOnline();
    this.offlineHandler = () => this.handleOffline();
  }

  // ── Start monitoring ──────────────────────────────────────────

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Listen to browser online/offline events
    window.addEventListener("online",  this.onlineHandler);
    window.addEventListener("offline", this.offlineHandler);

    // Initial probe
    this.probe();

    // Recurring probe
    this.intervalHandle = setInterval(() => this.probe(), PROBE_INTERVAL_MS);
  }

  // ── Stop monitoring ───────────────────────────────────────────

  stop(): void {
    this.isRunning = false;
    window.removeEventListener("online",  this.onlineHandler);
    window.removeEventListener("offline", this.offlineHandler);
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  // ── Single probe ──────────────────────────────────────────────

  async probe(): Promise<void> {
    if (!navigator.onLine) {
      this.handleOffline();
      return;
    }

    const networkStore = useNetworkStore.getState();
    networkStore.setIsProbing(true);

    const controller = new AbortController();
    const timeout    = setTimeout(
      () => controller.abort(),
      FAST_PROBE_TIMEOUT
    );

    const startTime = Date.now();

    try {
      await fetch(PROBE_URL, {
        method:  "HEAD",
        cache:   "no-cache",
        signal:  controller.signal,
        headers: { "x-probe": "1" },
      });

      const rtt = Date.now() - startTime;
      networkStore.recordRTT(rtt);

      // Update overlay color
      useOverlayStore.getState().setNetworkColor(
        networkStore.getOverlayColor()
      );

      // Deactivate offline fallback if we're back online
      if (networkStore.is_offline_fallback_active) {
        networkStore.deactivateOfflineFallback();
      }

    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // Timeout — treat as severely degraded, not full offline
        networkStore.recordRTT(FAST_PROBE_TIMEOUT + 1);
      } else {
        this.handleOffline();
      }
    } finally {
      clearTimeout(timeout);
      networkStore.setIsProbing(false);
    }
  }

  // ── Online/offline handlers ───────────────────────────────────

  private handleOnline(): void {
    // Probe immediately when browser reports back online
    this.probe();
  }

  private handleOffline(): void {
    const networkStore = useNetworkStore.getState();
    networkStore.activateOfflineFallback();
    networkStore.setMode("offline");
    useOverlayStore.getState().setNetworkColor("red");
    useOverlayStore.getState().setShowNetworkBanner?.(true);
  }

  // ── Force probe ───────────────────────────────────────────────

  forceProbe(): Promise<void> {
    return this.probe();
  }
}

// ─────────────────────────────────────────────────────────────────
// Singleton instance
// ─────────────────────────────────────────────────────────────────

export const networkMonitor = new NetworkMonitor();

// ─────────────────────────────────────────────────────────────────
// React integration hook helper (used in useNetworkMonitor hook)
// ─────────────────────────────────────────────────────────────────

export function startNetworkMonitoring(): () => void {
  networkMonitor.start();
  return () => networkMonitor.stop();
}

// ─────────────────────────────────────────────────────────────────
// Connection quality helpers
// ─────────────────────────────────────────────────────────────────

export function getConnectionQualityLabel(rttMs: number | null): string {
  if (rttMs === null)  return "Unknown";
  if (rttMs < 200)     return "Excellent";
  if (rttMs < 500)     return "Good";
  if (rttMs < 800)     return "Fair";
  if (rttMs < 2000)    return "Poor";
  return "Very Poor";
}

export function getConnectionQualityColor(rttMs: number | null): string {
  if (rttMs === null)  return "text-gray-400";
  if (rttMs < 200)     return "text-green-400";
  if (rttMs < 500)     return "text-green-300";
  if (rttMs < 800)     return "text-yellow-400";
  if (rttMs < 2000)    return "text-orange-400";
  return "text-red-400";
}

export function shouldWarnAboutLatency(avgRTT: number, avgAIResponseMs: number): boolean {
  // Warn if combined latency would noticeably delay hint delivery
  return avgRTT + avgAIResponseMs > 3000;
}
