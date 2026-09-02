import { useState, useEffect } from "react";
import { getCookieConsent, setCookieConsent } from "@/lib/privacy/cookieConsent";
import { initGoogleAds } from "@/lib/ads/googleAds";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = getCookieConsent();
    if (consent === "accepted") {
      initGoogleAds();
      return;
    }
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
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
    <div
      className="fixed inset-x-0 z-[9998] p-3 sm:p-4 bottom-16 md:bottom-0 pointer-events-none"
      role="dialog"
      aria-label="Cookie notice"
      data-testid="cookie-consent-banner"
    >
      <div className="pointer-events-auto max-w-2xl mx-auto bg-card border border-border rounded-2xl shadow-2xl shadow-black/20 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground mb-1">Cookie Notice</p>
          <p className="text-xs text-muted-foreground leading-relaxed break-words">
            We use essential cookies for authentication and, if you accept, optional analytics and Google Ads conversion cookies.{" "}
            {/* Plain <a>: this banner may mount outside RouterProvider (App.tsx sibling). */}
            <a href="/privacy" className="text-primary hover:underline">
              Review our privacy policy
            </a>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={decline}
            className="min-h-11 px-4 py-2 rounded-xl text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all flex-1 sm:flex-none"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={accept}
            className="min-h-11 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity flex-1 sm:flex-none"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}
