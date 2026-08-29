/**
 * Shared recovery actions for auth/profile load failures.
 * Keeps ProtectedRoute and AppLoadingFallback consistent.
 */

import { SUPPORT_EMAIL } from "@/lib/constants/contact";

export const PROFILE_FRIENDLY_ERROR =
  "Unable to load your account information.";

export function supportMailto(subject = "Clarify AI account help"): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export function hardReloadApp(): void {
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) void registration.unregister();
    });
  }
  if (window.caches) {
    void caches.keys().then((keys) => {
      for (const key of keys) void caches.delete(key);
    });
  }
  window.setTimeout(() => window.location.reload(), 150);
}
