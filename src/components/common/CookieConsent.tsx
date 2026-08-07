import { useState, useEffect } from "react";
import { agentLog } from "@/lib/debugAgentLog";

const CONSENT_KEY = "clarify_cookie_consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  function accept() {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setVisible(false);
  }

  function decline() {
    localStorage.setItem(CONSENT_KEY, "declined");
    setVisible(false);
  }

  if (!visible) return null;

  // #region agent log
  agentLog({hypothesisId:'A',location:'CookieConsent.tsx:visible',message:'CookieConsent visible (plain <a>, not Link)',data:{usesPlainAnchor:true,path:typeof window!=='undefined'?window.location.pathname:null}});
  // #endregion

  return (
    <div
      className="fixed inset-x-0 z-[9998] p-3 sm:p-4 bottom-16 md:bottom-0"
      role="dialog"
      aria-label="Cookie notice"
    >
      <div className="max-w-2xl mx-auto bg-card border border-border rounded-2xl shadow-2xl shadow-black/20 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground mb-1">Cookie Notice</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We use essential cookies for authentication and optional analytics cookies to improve the experience.{" "}
            {/* Plain <a>: this banner may mount outside RouterProvider (App.tsx sibling). */}
            <a href="/privacy" className="text-primary hover:underline">
              Review our privacy policy
            </a>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={decline}
            className="px-4 py-2 rounded-xl text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all"
          >
            Decline
          </button>
          <button
            onClick={accept}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}
