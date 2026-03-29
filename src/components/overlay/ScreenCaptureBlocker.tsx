import { useEffect, useRef, useCallback } from 'react';

/* ─── types ──────────────────────────────────────────────────────── */

type CaptureType = 'recording' | 'sharing' | 'screenshot';

interface ScreenCaptureBlockerProps {
  /** Master enable/disable switch */
  isActive?: boolean;
  /** Milliseconds between periodic checks (default 12 000) */
  pollIntervalMs?: number;
  /** Callback fired once per capture-type detection */
  onCaptureDetected?: (type: CaptureType) => void;
  children?: React.ReactNode;
}

/* ─── helpers ────────────────────────────────────────────────────── */

const SCREEN_LABEL_RE = /screen|display|monitor|window|tab/i;
const SHARE_LABEL_RE  = /share|cast|present|broadcast/i;

/**
 * Normalise device label to a CaptureType.
 * Returns null when the device isn't a virtual screen-capture source.
 */
function labelToCaptureType(label: string): CaptureType | null {
  if (!SCREEN_LABEL_RE.test(label)) return null;
  return SHARE_LABEL_RE.test(label) ? 'sharing' : 'recording';
}

/** Dispatch a namespaced DOM event so other parts of the app can listen. */
function emitCaptureEvent(type: CaptureType) {
  window.dispatchEvent(
    new CustomEvent('clarify:screencapture', { detail: { type }, bubbles: false }),
  );
}

/* ─── component ─────────────────────────────────────────────────── */

export function ScreenCaptureBlocker({
  isActive      = true,
  pollIntervalMs = 12_000,
  onCaptureDetected,
  children,
}: ScreenCaptureBlockerProps) {
  /**
   * Track already-notified types per visibility window.
   * Cleared when the tab becomes visible again so detection resets cleanly.
   */
  const notifiedRef  = useRef<Set<CaptureType>>(new Set());
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkingRef  = useRef(false); // prevents concurrent async checks

  /* ── core detection ──────────────────────────────────────────── */

  const notify = useCallback((type: CaptureType) => {
    if (notifiedRef.current.has(type)) return;
    notifiedRef.current.add(type);
    onCaptureDetected?.(type);
    emitCaptureEvent(type);
  }, [onCaptureDetected]);

  /**
   * Primary: enumerate media devices looking for virtual screen sources.
   * Works without any granted permission — labels are populated when a
   * screen-sharing session is active.
   */
  const checkDevices = useCallback(async () => {
    if (checkingRef.current) return;
    if (!navigator.mediaDevices?.enumerateDevices) return;

    checkingRef.current = true;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      for (const d of devices) {
        if (d.kind !== 'videoinput' || !d.label) continue;
        const type = labelToCaptureType(d.label);
        if (type) { notify(type); break; }
      }
    } catch (err) {
      /* Non-fatal — browser may deny enumerateDevices in some contexts */
      console.warn('[ScreenCaptureBlocker] enumerateDevices error:', err);
    } finally {
      checkingRef.current = false;
    }
  }, [notify]);

  /**
   * Secondary: watch the MediaDevices `displayMedia` track list via
   * getDisplayMedia interception — best-effort, doesn't break if absent.
   */
  const patchGetDisplayMedia = useCallback(() => {
    if (typeof window === 'undefined') return;
    const mds = navigator.mediaDevices as MediaDevices & { _clarifyPatched?: boolean };
    if (!mds.getDisplayMedia || mds._clarifyPatched) return;

    const original = mds.getDisplayMedia.bind(mds);
    mds.getDisplayMedia = async function (options?: DisplayMediaStreamOptions) {
      try {
        const stream = await original(options);
        notify('sharing');

        /* Detect when sharing ends */
        stream.getTracks().forEach((track) => {
          track.addEventListener('ended', () => {
            notifiedRef.current.delete('sharing');
          }, { once: true });
        });

        return stream;
      } catch (err) {
        throw err; // user cancelled — not a detection event
      }
    };
    mds._clarifyPatched = true;
  }, [notify]);

  /* ── effects ─────────────────────────────────────────────────── */

  useEffect(() => {
    if (!isActive) {
      /* Reset state when deactivated */
      notifiedRef.current.clear();
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    patchGetDisplayMedia();
    checkDevices();

    intervalRef.current = setInterval(checkDevices, pollIntervalMs);

    /* Reset notified set when tab regains focus so re-detection is clean */
    const handleVisChange = () => {
      if (document.visibilityState === 'visible') {
        notifiedRef.current.clear();
        checkDevices();
      }
    };

    /* Re-check on device changes (plug/unplug of capture devices) */
    const onDeviceChange = () => checkDevices();

    document.addEventListener('visibilitychange', handleVisChange);
    try { navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange); } catch (_) {}

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisChange);
      try { navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange); } catch (_) {}
    };
  }, [isActive, pollIntervalMs, checkDevices, patchGetDisplayMedia]);

  return <>{children}</>;
}

export default ScreenCaptureBlocker;
