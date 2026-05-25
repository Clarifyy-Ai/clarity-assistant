// src/components/overlay/ScreenCaptureBlocker.tsx
// Manages screen capture detection and content protection.
// Renders a user-facing warning for unsupported environments instead of
// silently failing — users deserve to know the overlay is not protected.

import { useEffect, useRef, useCallback, useState } from "react";
import {
  getSupportInfo,
  patchGetDisplayMedia,
  enableContentProtection,
  onCaptureStateChange,
  isElectron,
} from "@/lib/overlay/screenCaptureEvasion";
import type { SupportLevel } from "@/lib/overlay/screenCaptureEvasion";
import { ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── TYPES ─────────────────────────────────────────────────────────────── */

type CaptureType = "recording" | "sharing";

interface ScreenCaptureBlockerProps {
  /** Master enable/disable switch */
  isActive?:         boolean;
  /** Milliseconds between periodic device-enumeration checks (default 12 000) */
  pollIntervalMs?:   number;
  /** Called once per unique CaptureType detected in the current visibility window */
  onCaptureDetected?: (type: CaptureType) => void;
  /** When true, the unsupported-browser warning is shown inline below children */
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
  level:   SupportLevel;
  reason:  string;
  misses:  string[];
  onDismiss: () => void;
}

function WarningBanner({ level, reason, misses, onDismiss }: WarningBannerProps) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-slate-500/10 border border-slate-500/20">
      <ShieldAlert className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-slate-300">
          Screen sharing awareness
        </p>
        <p className="text-[10px] text-slate-400/80 mt-0.5 leading-relaxed">
          Clarify AI does not hide the overlay from Zoom, Meet, Teams, or OS screen recording.
          {level !== "none" && " We may alert you when a capture device is detected."}
          {" "}Use practice mode only — not during real interviews.
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="text-slate-400/50 hover:text-slate-300 transition-colors shrink-0"
        aria-label="Dismiss notice"
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

    // Tier 1: Electron — enable OS content protection
    if (isElectron()) {
      void enableContentProtection();
    }

    // Tier 2: Chromium browser — patch getDisplayMedia prototype
    // patchGetDisplayMedia() is a no-op in Firefox/Safari
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
            Screen sharing detected
          </p>
        </div>
      )}

      {/* Support level warning — only when showWarning=true and not dismissed */}
      {isActive && showWarning && !dismissed && (
        <WarningBanner
          level={supportInfo.level}
          reason={supportInfo.reason}
          misses={supportInfo.misses}
          onDismiss={() => setDismissed(true)}
        />
      )}
    </>
  );
}

export default ScreenCaptureBlocker;
