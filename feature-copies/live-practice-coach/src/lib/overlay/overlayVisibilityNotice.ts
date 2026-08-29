import { toast } from "sonner";
import {
  OVERLAY_MOBILE_TOAST_BODY,
  OVERLAY_MOBILE_TOAST_TITLE,
} from "@/lib/constants/overlaySetupGuide";

const SESSION_NOTICE_KEY = "clarify:overlay_visibility_notice_v1";

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

/** One toast per browser tab session when entering Practice Coach on mobile. */
export function notifyOverlayVisibilityOnMobile(options?: { force?: boolean }): void {
  if (!isMobileViewport()) return;

  try {
    if (!options?.force && sessionStorage.getItem(SESSION_NOTICE_KEY) === "1") return;
    sessionStorage.setItem(SESSION_NOTICE_KEY, "1");
  } catch {
    // private mode — still show toast
  }

  toast.warning(OVERLAY_MOBILE_TOAST_TITLE, {
    description: OVERLAY_MOBILE_TOAST_BODY,
    duration: 12_000,
  });
}

export function clearOverlayVisibilityNotice(): void {
  try {
    sessionStorage.removeItem(SESSION_NOTICE_KEY);
  } catch {
    // ignore
  }
}
