import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, WifiOff, Wifi, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight network health detector using:
 * - navigator.onLine
 * - Network Information API (when available)
 *
 * Shows a small banner under the top bar when:
 *  - Offline
 *  - Connection appears degraded (very slow / high RTT / low downlink)
 */
export function NetworkBanner() {
  // Basic "online" state from the browser
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);

  // Optional Network Information API (may be undefined in many browsers)
  const connection = useMemo(() => {
    return typeof navigator !== "undefined" ? (navigator as any).connection ?? (navigator as any).mozConnection ?? (navigator as any).webkitConnection : undefined;
  }, []);

  const [effectiveType, setEffectiveType] = useState<string | undefined>(() => connection?.effectiveType);
  const [downlink, setDownlink] = useState<number | undefined>(() => connection?.downlink);
  const [rtt, setRtt] = useState<number | undefined>(() => connection?.rtt);
  const [saveData, setSaveData] = useState<boolean | undefined>(() => connection?.saveData);

  // Local dismiss so users can hide the banner temporarily
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    let cleanupConn: (() => void) | undefined;

    if (connection) {
      const handleChange = () => {
        setEffectiveType(connection.effectiveType);
        setDownlink(connection.downlink);
        setRtt(connection.rtt);
        setSaveData(connection.saveData);
      };
      connection.addEventListener?.("change", handleChange);
      cleanupConn = () => connection.removeEventListener?.("change", handleChange);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      cleanupConn?.();
    };
  }, [connection]);

  // Heuristics for "poor" connection
  const isPoor = useMemo(() => {
    // If we don't have connection info, don't mark as poor—only show if offline.
    if (!connection) return false;

    const slowType = effectiveType === "slow-2g" || effectiveType === "2g";
    const highLatency = typeof rtt === "number" && rtt > 500;              // >500ms RTT is quite laggy
    const tinyDownlink = typeof downlink === "number" && downlink < 1;     // <1Mbps may struggle with live features

    return slowType || highLatency || tinyDownlink || !!saveData;
  }, [connection, effectiveType, rtt, downlink, saveData]);

  // Decide whether to show the banner
  const shouldShow = !dismissed && (!isOnline || isPoor);

  if (!shouldShow) return null;

  const isDegradedButOnline = isOnline && isPoor;

  return (
    <div
      className={cn(
        "w-full flex-shrink-0",
        "border-b border-border backdrop-blur"
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "mx-auto flex max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8 py-2.5",
          !isOnline
            ? "bg-red-500/10 text-red-300"
            : "bg-amber-500/10 text-amber-300"
        )}
      >
        <div className="flex items-center justify-center rounded-md border border-border bg-secondary p-1.5">
          {!isOnline ? (
            <WifiOff className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {!isOnline ? (
            <>
              <p className="text-sm font-semibold">You’re offline</p>
              <p className="text-xs opacity-80">
                Check your connection. Live features and transcript streaming are paused.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">Connection looks unstable</p>
              <p className="text-xs opacity-80">
                Live Co‑Pilot may lag on slow networks.{" "}
                <span className="opacity-70">
                  {effectiveType && `Type: ${effectiveType}`}
                  {typeof downlink === "number" && ` · Downlink: ${downlink.toFixed(1)}Mbps`}
                  {typeof rtt === "number" && ` · RTT: ${rtt}ms`}
                  {saveData && " · Data saver on"}
                </span>
              </p>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className={cn(
            "rounded-lg p-1.5 transition-colors",
            !isOnline
              ? "hover:bg-red-500/20 text-red-200"
              : "hover:bg-amber-500/20 text-amber-200"
          )}
          aria-label="Dismiss network banner"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        {isDegradedButOnline && (
          <a
            href="https://fast.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary text-foreground transition-colors hover:bg-secondary/80"
            title="Run a quick speed test"
          >
            <Wifi className="h-3.5 w-3.5" />
            Test speed
          </a>
        )}
      </div>
    </div>
  );
}
