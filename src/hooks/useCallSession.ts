// ✅ FIX P4: Unified call session lifecycle + stable audio API for live/mock entry.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveCopilot } from "@/hooks/useLiveCopilot";
import { useSessionStore } from "@/store/sessionStore";
import { useAudioStore } from "@/store/audioStore";
import type { LiveSessionConfig } from "@/types/session.types";

export type CallSessionLifecycle =
  | "initialising"
  | "ready"
  | "live"
  | "ending"
  | "ended";

interface UseCallSessionOptions {
  config: LiveSessionConfig;
  sessionType?: "live" | "mock" | "warmup" | "rehearsal";
  existingSessionId?: string | null;
}

export function useCallSession({
  config,
  sessionType = "live",
  existingSessionId = null,
}: UseCallSessionOptions) {
  const [lifecycle, setLifecycle] = useState<CallSessionLifecycle>("ready");
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const endingRef = useRef(false);

  const copilot = useLiveCopilot({
    config,
    sessionType,
    existingSessionId,
  });

  const sessionStatus = useSessionStore((s) => s.status);
  const providerStatus = useAudioStore((s) => s.transcription_provider_status);
  const isCapturing = useAudioStore((s) => s.streams?.is_capturing ?? false);

  const isReconnecting =
    providerStatus === "reconnecting" || providerStatus === "connecting";

  useEffect(() => {
    if (endingRef.current) {
      setLifecycle("ending");
      return;
    }

    setLifecycle((prev) => {
      if (prev === "ended") return prev;

      if (copilot.isPreparingSession) return "initialising";
      if (sessionStatus === "active" && isCapturing) return "live";
      if (sessionStatus === "active") return "ready";
      return "ready";
    });
  }, [copilot.isPreparingSession, sessionStatus, isCapturing]);

  const startSession = useCallback(async () => {
    setLifecycle("initialising");
    await copilot.startLiveSession();
  }, [copilot]);

  const requestEndSession = useCallback(() => {
    setEndConfirmOpen(true);
  }, []);

  const confirmEndSession = useCallback(async () => {
    endingRef.current = true;
    setLifecycle("ending");
    setEndConfirmOpen(false);
    try {
      await copilot.endLiveSession();
    } finally {
      endingRef.current = false;
      setLifecycle("ended");
    }
  }, [copilot]);

  const cancelEndSession = useCallback(() => {
    setEndConfirmOpen(false);
  }, []);

  const lifecycleLabel = useMemo(() => {
    switch (lifecycle) {
      case "initialising":
        return "Initialising…";
      case "ready":
        return "Ready";
      case "live":
        return "Live";
      case "ending":
        return "Ending…";
      case "ended":
        return "Ended";
      default:
        return "";
    }
  }, [lifecycle]);

  return {
    lifecycle,
    lifecycleLabel,
    isReconnecting,
    endConfirmOpen,
    requestEndSession,
    confirmEndSession,
    cancelEndSession,
    startSession,
    copilot,
  };
}
