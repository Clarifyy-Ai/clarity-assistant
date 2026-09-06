import { useState, useEffect } from "react";
import { Shield } from "lucide-react";
import { getCookieConsent, setCookieConsent } from "@/lib/privacy/cookieConsent";
import { initGoogleAds } from "@/lib/ads/googleAds";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

/**
 * First-visit privacy & security notice for guests and signed-out users.
 * Shown as an in-app modal — distinct from the browser's native "Save password?" UI.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(() => getCookieConsent() === null);

  useBodyScrollLock(visible);

  useEffect(() => {
    const consent = getCookieConsent();
    if (consent === "accepted") {
      initGoogleAds();
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (visible) {
      root.setAttribute("data-cookie-banner", "1");
      document.body.classList.add("cookie-banner-visible");
    } else {
      root.removeAttribute("data-cookie-banner");
      document.body.classList.remove("cookie-banner-visible");
    }
    return () => {
      root.removeAttribute("data-cookie-banner");
      document.body.classList.remove("cookie-banner-visible");
    };
  }, [visible]);

  function accept() {
    setCookieConsent("accepted");
    initGoogleAds();
    setVisible(false);
  }

  function decline() {
    setCookieConsent("declined");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[9998] bg-background/75 backdrop-blur-sm"
        aria-hidden="true"
        data-testid="cookie-consent-backdrop"
      />
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none"
        role="dialog"
        aria-modal="true"
        aria-label="Cookie notice"
        data-testid="cookie-consent-banner"
      >
        <div className="pointer-events-auto w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl shadow-black/25 p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-base font-semibold text-foreground">
                Privacy &amp; Security Notice
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground font-medium">Practice and rehearsal only.</strong>{" "}
                Career Pilot is for mock interviews and prep — not for use during real employer
                assessments or live third-party interviews.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                We use essential cookies for authentication and, if you accept, optional analytics
                and Google Ads conversion cookies.{" "}
                <a href="/privacy" className="text-primary hover:underline">
                  Review our privacy policy
                </a>
              </p>
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={decline}
              className="min-h-11 px-4 py-2 rounded-xl text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all"
            >
              Decline optional cookies
            </button>
            <button
              type="button"
              onClick={accept}
              className="min-h-11 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Accept All
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
