import { toast } from "sonner";
import { useOverlayStore } from "@/store/overlayStore";

/** Block capture when offline or network monitor reports red (no connectivity). */
export function isCaptureBlockedByNetwork(): boolean {
  const networkColor = useOverlayStore.getState().network_color;
  if (networkColor === "red") return true;
  return typeof navigator !== "undefined" && !navigator.onLine;
}

export function assertOnlineForCapture(): boolean {
  if (!isCaptureBlockedByNetwork()) return true;
  toast.error("You're offline — screen capture is paused until your connection returns.");
  return false;
}
