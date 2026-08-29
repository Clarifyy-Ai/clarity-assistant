import { useCallback, useRef, useState } from "react";
import { startTabShareBestEffort } from "@/lib/capture/tabAudioCapture";

// ─────────────────────────────────────────────────────────────────
// useSafeTabShare
// Initiates a privacy-preserving "This Tab" share via
// startTabShareBestEffort, targeting the #root element so the
// floating overlay (#overlay-root sibling) is naturally excluded from
// the capture.
//
// Intended use: "Share Tab Safely" button in the live session page.
// The returned stream contains a video track the caller can attach to
// a <video> element (preview) or hand off to a WebRTC sender.
// ─────────────────────────────────────────────────────────────────

export function useSafeTabShare() {
  const streamRef = useRef<MediaStream | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const startShare = useCallback(async (): Promise<MediaStream | null> => {
    setError(null);

    // Resolve target: prefer #root (main React mount), fall back to <body>
    const target =
      (document.getElementById("root") as Element | null) ?? document.body;

    try {
      const stream = await startTabShareBestEffort(target);
      streamRef.current = stream;
      setIsSharing(true);

      // Auto-cleanup when the user ends the native share picker
      const firstTrack = stream.getTracks()[0];
      firstTrack?.addEventListener("ended", () => {
        streamRef.current = null;
        setIsSharing(false);
      });

      return stream;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Tab share unavailable";
      setError(msg);
      return null;
    }
  }, []);

  const stopShare = useCallback((): void => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsSharing(false);
  }, []);

  return {
    startShare,
    stopShare,
    isSharing,
    error,
    isSupported: typeof (navigator.mediaDevices as any)?.getDisplayMedia === "function",
  };
}
