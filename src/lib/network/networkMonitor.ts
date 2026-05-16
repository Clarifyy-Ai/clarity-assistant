// src/lib/network/networkMonitor.ts
//
// Continuously probes network quality and updates store.
// Drives the overlay indicator color and model auto-downgrade.

import { SUPABASE_URL } from "@/lib/env";
import { useNetworkStore } from "@/store/networkStore";
import { useOverlayStore } from "@/store/overlayStore";

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const PROBE_INTERVAL_MS  = 10_000;  // probe every 10s
const FAST_PROBE_TIMEOUT = 5_000;   // abort probe if no response in 5s

// FIX 1: Don't probe your own edge function — it requires CORS + auth
// and causes hundreds of ERR_FAILED errors in the console.
// Use a reliable public endpoint instead (Google favicon is ~200 bytes,
// always available, no auth, no CORS needed).
const PROBE_URL = "https://www.google.com/favicon.ico";

// Kept as fallback RTT reference — used if you ever switch back to own endpoint
// const PROBE_URL = `${SUPABASE_URL}/functions/v1/ping`;

// ─────────────────────────────────────────────────────────────────
// NetworkMonitor class
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
      // FIX 2: Use GET instead of HEAD.
      // HEAD requests are often blocked by CORS preflight on edge functions,
      // and some CDNs/proxies don't respond to HEAD the same way as GET.
      // GET on a tiny public resource gives accurate RTT with zero auth issues.
      const res = await fetch(PROBE_URL, {
        method: "GET",
        cache:  "no-store",   // FIX 3: "no-store" prevents caching of probe response
        signal: controller.signal,
        // FIX 4: Removed "x-probe" custom header — custom headers on cross-origin
        // requests trigger a CORS preflight even on public URLs, defeating the purpose.
      });

      if (!res.ok && res.status !== 0) {
        // Non-2xx but reachable — network is degraded, not offline
        networkStore.recordRTT(FAST_PROBE_TIMEOUT - 1);
      } else {
        const rtt = Date.now() - startTime;
        networkStore.recordRTT(rtt);
      }

      // Update overlay color based on latest RTT
      useOverlayStore.getState().setNetworkColor(
        networkStore.getOverlayColor()
      );

      // Deactivate offline fallback if we're back online
      if (networkStore.is_offline_fallback_active) {
        networkStore.deactivateOfflineFallback();
      }

    } catch (err) {
      const error = err as Error;

      if (error.name === "AbortError") {
        // Timed out — severely degraded but not fully offline
        networkStore.recordRTT(FAST_PROBE_TIMEOUT + 1);
        useOverlayStore.getState().setNetworkColor(
          networkStore.getOverlayColor()
        );
      } else if (error.name === "TypeError") {
        // FIX 5: TypeError = actual network failure (offline or DNS failure).
        // Previously this was not distinguished from AbortError, causing
        // "degraded" status when the user was actually fully offline.
        this.handleOffline();
      } else {
        // Unknown error — treat as degraded, not offline
        networkStore.recordRTT(FAST_PROBE_TIMEOUT - 1);
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
// React integration hook helper
// ─────────────────────────────────────────────────────────────────

export function startNetworkMonitoring(): () => void {
  networkMonitor.start();
  return () => networkMonitor.stop();
}

// ─────────────────────────────────────────────────────────────────
// Connection quality helpers
// ─────────────────────────────────────────────────────────────────

export function getConnectionQualityLabel(rttMs: number | null): string {
  if (rttMs === null)           return "Unknown";
  if (rttMs < 200)              return "Excellent";
  if (rttMs < 500)              return "Good";
  if (rttMs < 800)              return "Fair";
  if (rttMs < 2000)             return "Poor";
  return "Very Poor";
}

export function getConnectionQualityColor(rttMs: number | null): string {
  if (rttMs === null)           return "text-gray-400";
  if (rttMs < 200)              return "text-green-400";
  if (rttMs < 500)              return "text-green-300";
  if (rttMs < 800)              return "text-yellow-400";
  if (rttMs < 2000)             return "text-orange-400";
  return "text-red-400";
}

export function shouldWarnAboutLatency(
  avgRTT: number,
  avgAIResponseMs: number
): boolean {
  return avgRTT + avgAIResponseMs > 3000;
}
