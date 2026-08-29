import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, WifiOff, Wifi, RefreshCw, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { NetworkErrorPage } from "@/components/common/NetworkErrorPage";
import { useIsOffline } from "@/hooks/useIsOffline";

type NetworkState = "online" | "reconnecting" | "offline";

export function NetworkBanner() {
  const { isOffline: hookOffline, retry: retryConnection } = useIsOffline();
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [networkState, setNetworkState] = useState<NetworkState>("online");
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showFullErrorPage, setShowFullErrorPage] = useState(false);

  const connection = useMemo(() => {
    return typeof navigator !== "undefined"
      ? (navigator as any).connection ??
          (navigator as any).mozConnection ??
          (navigator as any).webkitConnection
      : undefined;
  }, []);

  const [effectiveType, setEffectiveType] = useState<string | undefined>(
    () => connection?.effectiveType,
  );
  const [downlink, setDownlink] = useState<number | undefined>(
    () => connection?.downlink,
  );
  const [rtt, setRtt] = useState<number | undefined>(() => connection?.rtt);
  const [saveData, setSaveData] = useState<boolean | undefined>(
    () => connection?.saveData,
  );

  const [dismissed, setDismissed] = useState(false);

  const logNetworkChange = useCallback((from: string, to: string) => {
    if (import.meta.env.DEV) {
      console.debug(`[NetworkBanner] ${from} → ${to}`, {
        ts: new Date().toISOString(),
        onLine: navigator.onLine,
      });
    }
  }, []);

  useEffect(() => {
    function handleOnline() {
      setNetworkState((prev) => {
        logNetworkChange(prev, "reconnecting");
        return "reconnecting";
      });
      setDismissed(false);

      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        setIsOnline(true);
        setNetworkState((prev) => {
          logNetworkChange(prev, "online");
          return "online";
        });
      }, 2000);
    }

    function handleOffline() {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      setIsOnline(false);
      setNetworkState((prev) => {
        logNetworkChange(prev, "offline");
        return "offline";
      });
      setDismissed(false);
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
        logNetworkChange(
          "connection-change",
          connection.effectiveType ?? "unknown",
        );
      };
      connection.addEventListener?.("change", handleChange);
      cleanupConn = () =>
        connection.removeEventListener?.("change", handleChange);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      cleanupConn?.();
    };
  }, [connection, logNetworkChange]);

  const isPoor = useMemo(() => {
    if (!connection) return false;

    const slowType = effectiveType === "slow-2g" || effectiveType === "2g";
    const highLatency = typeof rtt === "number" && rtt > 500;
    const tinyDownlink = typeof downlink === "number" && downlink < 1;

    return slowType || highLatency || tinyDownlink || !!saveData;
  }, [connection, effectiveType, rtt, downlink, saveData]);

  const isReconnecting = networkState === "reconnecting";
  const isOffline = (!isOnline && !isReconnecting) || hookOffline;
  const shouldShow = !dismissed && (!isOnline || isPoor || isReconnecting || hookOffline);

  const handleRetry = useCallback(() => {
    retryConnection();
    if (navigator.onLine) {
      setIsOnline(true);
      setNetworkState("online");
      setDismissed(false);
      setShowFullErrorPage(false);
    }
  }, [retryConnection]);

  useEffect(() => {
    if (!isOffline) setShowFullErrorPage(false);
  }, [isOffline]);

  if (showFullErrorPage && isOffline) {
    return (
      <div className="sticky top-0 z-[300] border-b border-border bg-background">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowFullErrorPage(false)}
            className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Dismiss full-page network error"
          >
            <X className="h-4 w-4" />
          </button>
          <NetworkErrorPage onRetry={handleRetry} />
        </div>
      </div>
    );
  }

  if (!shouldShow) return null;

  const isDegradedButOnline = isOnline && isPoor && !isReconnecting;

  const bannerColor = isOffline
    ? "bg-red-500/10 text-red-300"
    : isReconnecting
      ? "bg-blue-500/10 text-blue-300"
      : "bg-amber-500/10 text-amber-300";

  const dismissColor = isOffline
    ? "hover:bg-red-500/20 text-red-200"
    : isReconnecting
      ? "hover:bg-blue-500/20 text-blue-200"
      : "hover:bg-amber-500/20 text-amber-200";

  return (
    <div
      className={cn(
        "w-full flex-shrink-0",
        "border-b border-border backdrop-blur",
        isOffline && "sticky top-0 z-[300]",
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "mx-auto flex max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8 py-2.5",
          bannerColor,
        )}
      >
        <div className="flex items-center justify-center rounded-md border border-border bg-secondary p-1.5">
          {!isOnline && !isReconnecting ? (
            <WifiOff className="h-4 w-4" />
          ) : isReconnecting ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {isOffline ? (
            <>
              <p className="text-sm font-semibold">You're offline</p>
              <p className="text-xs opacity-80">
                Check your Wi‑Fi or mobile data. Live sessions, AI responses, and
                sync are paused until you're back online.
              </p>
            </>
          ) : isReconnecting ? (
            <>
              <p className="text-sm font-semibold">Reconnecting…</p>
              <p className="text-xs opacity-80">
                Network detected — restoring connection.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">
                Connection looks unstable
              </p>
              <p className="text-xs opacity-80">
                Practice Coach may lag on slow networks.{" "}
                <span className="opacity-70">
                  {effectiveType && `Type: ${effectiveType}`}
                  {typeof downlink === "number" &&
                    ` · Downlink: ${downlink.toFixed(1)}Mbps`}
                  {typeof rtt === "number" && ` · RTT: ${rtt}ms`}
                  {saveData && " · Data saver on"}
                </span>
              </p>
            </>
          )}
        </div>

        {isOffline && (
          <>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/20"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
            <button
              type="button"
              onClick={() => setShowFullErrorPage(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary/80"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Connection help
            </button>
          </>
        )}

        {!isOffline && (
          <>
            <button
              type="button"
              onClick={() => {
                const started = performance.now();
                void fetch("/", { method: "HEAD", cache: "no-store" })
                  .then(() => {
                    const ms = Math.round(performance.now() - started);
                    const conn =
                      typeof navigator !== "undefined"
                        ? (navigator as Navigator & {
                            connection?: { downlink?: number; rtt?: number; effectiveType?: string };
                          }).connection
                        : undefined;
                    if (conn?.effectiveType) setEffectiveType(conn.effectiveType);
                    if (typeof conn?.downlink === "number") setDownlink(conn.downlink);
                    if (typeof conn?.rtt === "number") setRtt(conn.rtt);
                  })
                  .catch(() => {
                    setNetworkState("offline");
                  });
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary/80"
            >
              <Wifi className="h-3.5 w-3.5" />
              Test connection
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className={cn("rounded-lg p-1.5 transition-colors", dismissColor)}
              aria-label="Dismiss network banner"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}

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
