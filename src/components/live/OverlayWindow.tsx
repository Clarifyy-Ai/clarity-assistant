// pseudo‑code for src/components/live/OverlayWindow.tsx

import { useEffect } from "react";
import { enableScreenCaptureBlocker, disableScreenCaptureBlocker } from "@/lib/stealth/screenCaptureBlocker";
import { STEALTH_OVERLAY_ROOT_ID } from "@/lib/stealth/stealthConfig";

export function OverlayWindow() {
  useEffect(() => {
    // Ensure root id matches config so opacity/focus hooks work
    const root = document.getElementById(STEALTH_OVERLAY_ROOT_ID);
    if (!root) {
      console.warn("[overlay] Expected overlay root with id", STEALTH_OVERLAY_ROOT_ID);
    }

    void enableScreenCaptureBlocker({
      excludeFromCapture: true,
      enableOpacityAutoFade: true,
      enableAutoHideOnFocusLoss: true,
    });

    return () => {
      void disableScreenCaptureBlocker();
    };
  }, []);

  return (
    <div id={STEALTH_OVERLAY_ROOT_ID}>
      {/* existing overlay UI */}
    </div>
  );
}
