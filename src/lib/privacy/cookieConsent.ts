/** First-visit cookie banner storage. Keep the key stable so returning users are not re-prompted. */
export const COOKIE_CONSENT_KEY = "clarify_cookie_consent";
export const COOKIE_CONSENT_EVENT = "clarify:cookie-consent";

export type CookieConsentValue = "accepted" | "declined";

export function getCookieConsent(): CookieConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (raw === "accepted" || raw === "declined") return raw;
  } catch {
    /* private mode / blocked storage */
  }
  return null;
}

export function hasMarketingConsent(): boolean {
  return getCookieConsent() === "accepted";
}

export function setCookieConsent(value: CookieConsentValue): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, value);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: value }));
}
