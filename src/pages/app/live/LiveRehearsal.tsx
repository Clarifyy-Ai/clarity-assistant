// src/pages/app/live/LiveRehearsal.tsx — setup + post-session summary only.
// Mid-session UI always lives at /app/live/overlay (Parakeet-aligned).
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PreSessionSetupWizard } from "@/components/session/PreSessionSetupWizard";
import { PostSessionSummary } from "@/components/session/PostSessionSummary";
import {
  ExternalLink,
  Monitor,
} from "lucide-react";
import { SessionTrustBanner } from "@/components/session/SessionTrustBanner";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { cn } from "@/lib/utils";
import type { LiveSessionConfig } from "@/types/session.types";
import { notifyOverlayVisibilityOnMobile } from "@/lib/overlay/overlayVisibilityNotice";
import { getDefaultOverlayEnabled } from "@/lib/overlay/defaultOverlayPreference";
import { isElectronApp } from "@/lib/platform/isElectron";
import { DesktopDownloadButton } from "@/components/common/DesktopDownloadButton";
import {
  saveLastPracticeSetup,
  stashPendingPracticeSetup,
} from "@/lib/session/lastPracticeSetup";

export default function LiveRehearsal() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const endedSessionId = searchParams.get("ended");
  const [defaultOverlay, setDefaultOverlay] = useState(false);
  const sessionActive = useSessionStore(
    (s) => s.status === "active" && Boolean(s.session_id),
  );
  const overlayVisible = useOverlayStore((s) => s.is_visible);
  const hasActiveOverlaySession = sessionActive || overlayVisible;

  useEffect(() => {
    setDefaultOverlay(getDefaultOverlayEnabled());
  }, []);

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

  if (hasActiveOverlaySession) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-center space-y-4 max-w-md">
          <p className="text-lg font-semibold text-foreground">Session in progress</p>
          <p className="text-sm text-muted-foreground">
            You already have an active Practice Coach session. Return to the overlay to continue
            or end it before starting a new setup.
          </p>
          <Link
            to="/app/live/overlay"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Open active session
            <ExternalLink className="w-3.5 h-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <SessionTrustBanner className="mx-auto max-w-2xl mt-4 mb-2" variant="live" />
      <div
        role="note"
        className={cn(
          "mx-auto max-w-2xl mb-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border px-4 py-3 text-sm",
          defaultOverlay
            ? "border-primary bg-primary/10 ring-1 ring-primary/20"
            : "border-primary/30 bg-primary/10",
        )}
      >
        <p className="flex-1 text-foreground">
          Starting a session opens <strong className="text-primary">Overlay mode</strong> — the
          focused Practice Coach window without the app sidebar.
        </p>
        <Link
          to="/app/live/overlay"
          className={cn(
            "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity bg-primary",
            defaultOverlay && "shadow-md shadow-primary/25",
          )}
        >
          Open Overlay setup
          <ExternalLink className="w-3.5 h-3.5" aria-hidden />
        </Link>
      </div>
      {!isElectronApp() && (
        <div
          role="note"
          className="mx-auto max-w-2xl mb-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm"
        >
          <Monitor className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
          <p className="flex-1 text-muted-foreground">
            Floating overlay, global hotkeys, and tab-audio capture work best in the desktop app.
            Browser Overlay sessions remain fully available.
          </p>
          <DesktopDownloadButton className="shrink-0" />
        </div>
      )}
      <PreSessionSetupWizard onStart={handleSetup} sessionType="live" />
    </>
  );
}
