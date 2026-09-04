// src/components/overlay/ScreenCaptureBlocker.tsx
// Detects screen capture / share activity and shows an honesty notice.
// Capture exclusion is intentionally disabled — the overlay stays visible.

import { useEffect, useRef, useCallback, useState } from "react";
import {
  getSupportInfo,
  patchGetDisplayMedia,
  enableContentProtection,
  onCaptureStateChange,
  CAPTURE_EXCLUSION_DISCLAIMER,
} from "@/lib/overlay/screenCaptureEvasion";
import type { SupportInfo } from "@/lib/overlay/screenCaptureEvasion";
import { ShieldAlert, X } from "lucide-react";

/* ─── TYPES ─────────────────────────────────────────────────────────────── */

type CaptureType = "recording" | "sharing";

interface ScreenCaptureBlockerProps {
  /** Master enable/disable switch */
  isActive?:         boolean;
  /** Milliseconds between periodic device-enumeration checks (default 12 000) */
  pollIntervalMs?:   number;
  /** Called once per unique CaptureType detected in the current visibility window */
  onCaptureDetected?: (type: CaptureType) => void;
  /** When true, the honesty warning is shown inline below children */
  showWarning?:       boolean;
  children?:          React.ReactNode;
}

/* ─── HELPERS ────────────────────────────────────────────────────────────── */

const SCREEN_LABEL_RE = /screen|display|monitor|window|tab/i;
const SHARE_LABEL_RE  = /share|cast|present|broadcast/i;

function labelToCaptureType(label: string): CaptureType | null {
  if (!SCREEN_LABEL_RE.test(label)) return null;
  return SHARE_LABEL_RE.test(label) ? "sharing" : "recording";
}

function emitCaptureEvent(type: CaptureType) {
  window.dispatchEvent(
    new CustomEvent("clarify:screencapture", { detail: { type }, bubbles: false }),
  );
}

/* ─── WARNING BANNER ─────────────────────────────────────────────────────── */

interface WarningBannerProps {
  info: SupportInfo;
  onDismiss: () => void;
}

function WarningBanner({ info, onDismiss }: WarningBannerProps) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
      <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-amber-400">
          Capture exclusion: {info.label}
        </p>
        <p className="text-[10px] text-amber-400/70 mt-0.5 leading-relaxed">
          {info.reason}
        </p>
        <p className="text-[10px] text-amber-400/60 mt-1.5 leading-relaxed">
          {info.disclaimer || CAPTURE_EXCLUSION_DISCLAIMER}
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="text-amber-400/50 hover:text-amber-400 transition-colors shrink-0"
        aria-label="Dismiss warning"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

/* ─── COMPONENT ──────────────────────────────────────────────────────────── */

export function ScreenCaptureBlocker({
  isActive        = true,
  pollIntervalMs  = 12_000,
  onCaptureDetected,
  showWarning     = true,
  children,
}: ScreenCaptureBlockerProps) {
  const supportInfo    = getSupportInfo();
  const [dismissed, setDismissed] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const notifiedRef  = useRef<Set<CaptureType>>(new Set());
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkingRef  = useRef(false);

  /* ── NOTIFY HELPER ───────────────────────────────────────────────────── */

  const notify = useCallback((type: CaptureType) => {
    if (notifiedRef.current.has(type)) return;
    notifiedRef.current.add(type);
    onCaptureDetected?.(type);
    emitCaptureEvent(type);
  }, [onCaptureDetected]);

  /* ── DEVICE ENUMERATION (works on Chrome + Firefox without permission) ── */

  const checkDevices = useCallback(async () => {
    if (checkingRef.current) return;
    if (!navigator.mediaDevices?.enumerateDevices) return;

    checkingRef.current = true;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      for (const d of devices) {
        if (d.kind !== "videoinput" || !d.label) continue;
        const type = labelToCaptureType(d.label);
        if (type) { notify(type); break; }
      }
    } catch (err) {
      console.warn("[ScreenCaptureBlocker] enumerateDevices error:", err);
    } finally {
      checkingRef.current = false;
    }
  }, [notify]);

  /* ── EFFECT: INIT ────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!isActive) {
      notifiedRef.current.clear();
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    // Detection only — never exclude the overlay from capture.
    void enableContentProtection();
    patchGetDisplayMedia();

    // Subscribe to lib-level capture state changes (fired by patched getDisplayMedia)
    const unsubCapture = onCaptureStateChange((active) => {
      setIsCapturing(active);
      if (active) notify("sharing");
      else notifiedRef.current.delete("sharing");
    });

    // Tier 2 + 3 fallback: device enumeration polling
    void checkDevices();
    intervalRef.current = setInterval(() => void checkDevices(), pollIntervalMs);

    const handleVisChange = () => {
      if (document.visibilityState === "visible") {
        notifiedRef.current.clear();
        void checkDevices();
      }
    };

    const onDeviceChange = () => void checkDevices();

    document.addEventListener("visibilitychange", handleVisChange);
    try {
      navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    } catch (_) { /* not all browsers support this */ }

    return () => {
      unsubCapture();
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisChange);
      try {
        navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
      } catch (_) { /* ignore */ }
    };
  }, [isActive, pollIntervalMs, checkDevices, notify]);

  /* ── RENDER ──────────────────────────────────────────────────────────── */

  return (
    <>
      {children}

      {/* Active capture indicator — shown regardless of support level */}
      {isActive && isCapturing && (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/25 animate-pulse"
          role="alert"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
          <p className="text-[10px] font-semibold text-red-400">
            Screen sharing detected — overlay remains visible ({supportInfo.label})
          </p>
        </div>
      )}

      {/* Honesty warning — disclaimer before any capture-exclusion claim */}
      {isActive && showWarning && !dismissed && (
        <WarningBanner
          info={supportInfo}
          onDismiss={() => setDismissed(true)}
        />
      )}
    </>
  );
}

export default ScreenCaptureBlocker;
