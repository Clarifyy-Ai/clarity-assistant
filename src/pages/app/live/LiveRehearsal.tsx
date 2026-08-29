// src/pages/app/live/LiveRehearsal.tsx — setup + post-session summary only.
// Mid-session UI always lives at /app/live/overlay (Parakeet-aligned).
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PreSessionSetupWizard } from "@/components/session/PreSessionSetupWizard";
import { PostSessionSummary } from "@/components/session/PostSessionSummary";
import {
  Monitor,
} from "lucide-react";
import { SessionTrustBanner } from "@/components/session/SessionTrustBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useOverlaySessionAuthorityStore } from "@/store/overlaySessionAuthorityStore";
import { cn } from "@/lib/utils";
import type { LiveSessionConfig } from "@/types/session.types";
import { notifyOverlayVisibilityOnMobile } from "@/lib/overlay/overlayVisibilityNotice";
import {
  OVERLAY_MOBILE_TOAST_BODY,
  OVERLAY_MOBILE_TOAST_TITLE,
} from "@/lib/constants/overlaySetupGuide";
import { getDefaultOverlayEnabled } from "@/lib/overlay/defaultOverlayPreference";
import { isElectronApp } from "@/lib/platform/isElectron";
import { DesktopDownloadButton } from "@/components/common/DesktopDownloadButton";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  saveLastPracticeSetup,
  stashPendingPracticeSetup,
} from "@/lib/session/lastPracticeSetup";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";

export default function LiveRehearsal() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const endedSessionId = searchParams.get("ended");
  const practiceContextId = searchParams.get("context");
  const [defaultOverlay, setDefaultOverlay] = useState(false);
  const [dismissMobileNotice, setDismissMobileNotice] = useState(false);
  const isMobile = useIsMobile();
  const sessionActive = useSessionStore(
    (s) => s.status === "active" && Boolean(s.session_id),
  );
  const overlayVisible = useOverlayStore((s) => s.is_visible);
  const authorityTerminal = useOverlaySessionAuthorityStore(
    (s) => s.lifecycle === "terminal",
  );
  const hasActiveOverlaySession =
    (sessionActive || overlayVisible) && !authorityTerminal;
  const shouldRedirectToOverlay =
    hasActiveOverlaySession && !endedSessionId && !practiceContextId;

  useEffect(() => {
    setDefaultOverlay(getDefaultOverlayEnabled());
  }, []);

  useEffect(() => {
    if (shouldRedirectToOverlay) {
      navigate("/app/live/overlay", { replace: true });
    }
  }, [shouldRedirectToOverlay, navigate]);

  useEffect(() => {
    notifyOverlayVisibilityOnMobile();
  }, []);

  const handleSetup = useCallback(
    (sessionConfig: LiveSessionConfig) => {
      saveLastPracticeSetup(sessionConfig);
      stashPendingPracticeSetup(sessionConfig);
      navigate("/app/live/overlay", { replace: false });
    },
    [navigate],
  );

  const clearSummary = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  if (endedSessionId) {
    return (
      <PostSessionSummary sessionId={endedSessionId} onStartNew={clearSummary} />
    );
  }

  if (shouldRedirectToOverlay) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <p className="text-sm text-muted-foreground">Returning to active session…</p>
      </div>
    );
  }

  return (
    <div
      data-testid="page-width-root"
      className={cn(PAGE_SHELL, "space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200")}
    >
      <PageHeader
        title={PRODUCT_NAMES.practiceCoach}
        description="Configure your live rehearsal session, then open Overlay mode."
        breadcrumbs={[
          { label: PRODUCT_NAMES.dashboard, href: "/app/dashboard" },
          { label: PRODUCT_NAMES.practiceCoach },
        ]}
      />

      <SessionTrustBanner variant="live" />

      {isMobile && !dismissMobileNotice && (
        <div
          role="status"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">{OVERLAY_MOBILE_TOAST_TITLE}</p>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                {OVERLAY_MOBILE_TOAST_BODY}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDismissMobileNotice(true)}
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground min-h-11 min-w-11"
              aria-label="Dismiss notice"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div
        role="note"
        className={cn(
          "flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border px-4 py-3 text-sm",
          defaultOverlay
            ? "border-primary bg-primary/10 ring-1 ring-primary/20"
            : "border-primary/30 bg-primary/10",
        )}
      >
        <p className="flex-1 text-foreground">
          Starting a session opens <strong className="text-primary">Overlay mode</strong> — the
          focused {PRODUCT_NAMES.practiceCoach} window without the app sidebar. Complete the
          setup wizard below; voice mode includes microphone and speaker checks, while text mode
          remains available when audio is unavailable.
        </p>
      </div>

      {!isElectronApp() && (
        <div
          role="note"
          className="flex flex-col sm:flex-row sm:items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm"
        >
          <Monitor className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
          <div className="flex-1 space-y-2 min-w-0">
            <p className="text-muted-foreground">
              Floating overlay, global hotkeys, and tab-audio capture work best in the desktop app.
              Browser Overlay sessions remain fully available.
            </p>
            <DesktopDownloadButton compact fullWidth showGuideLink={false} />
          </div>
        </div>
      )}

      <PreSessionSetupWizard onStart={handleSetup} sessionType="live" />
    </div>
  );
}
