import { ENV } from "@/lib/env";
import { useState, useEffect, useCallback, useRef } from "react";
import { scorecardsDB, sessionAnswersDB } from "@/lib/supabase/database";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { ApiClientError } from "@/lib/api/apiClient";
import { getAiUserFacingError } from "@/lib/network/aiErrorUx";
import { useAuthStore } from "@/store/userStore";
import { canShareScorecard } from "@/lib/privacy/privacyPrefs";
import type { Scorecard } from "@/types/scorecard.types";
import type { ScorecardUiStatus } from "@/lib/analytics/scoreStatus";
import {
  associateAnswersForSession,
  describeEvaluation,
} from "@/lib/scorecard/evaluation";

interface UseScorecardOptions {
  sessionId: string;
}

interface ScorecardState {
  scorecard: Scorecard | null;
  status: ScorecardUiStatus;
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  isShared: boolean;
  shareUrl: string | null;
  shareToken: string | null;
  shareBlockedReason: string | null;
}

const NO_ANSWERS_MESSAGE =
  "No answers were recorded for this session, so a scorecard cannot be generated. Re-run the session and answer at least one question.";

/**
 * Scorecards are authoritative only when persisted in `scorecards`.
 * Mount/refresh only reads the DB. AI generate-scorecard is an explicit user action.
 */
export function useScorecard({ sessionId }: UseScorecardOptions) {
  const generateInFlightRef = useRef(false);

  const [state, setState] = useState<ScorecardState>({
    scorecard: null,
    status: "loading",
    isLoading: true,
    isGenerating: false,
    error: null,
    isShared: false,
    shareUrl: null,
    shareToken: null,
    shareBlockedReason: null,
  });

  const applyScorecard = useCallback((existing: Scorecard) => {
    setState((s) => ({
      ...s,
      scorecard: existing,
      status: "scored",
      isLoading: false,
      isGenerating: false,
      error: null,
      isShared: existing.is_shared,
      shareToken: existing.share_token,
      shareUrl: existing.share_token ? buildShareUrl(existing.share_token) : null,
    }));
  }, []);

  const loadScorecard = useCallback(async (): Promise<void> => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      setState((s) => ({
        ...s,
        isLoading: false,
        isGenerating: false,
        status: "failed",
        error: "You must be signed in to view this scorecard.",
      }));
      return;
    }

    setState((s) => ({
      ...s,
      isLoading: true,
      status: "loading",
      error: null,
    }));

    try {
      const existing = await scorecardsDB.getBySessionIdForUser(sessionId, userId);
      if (existing) {
        applyScorecard(existing);
        return;
      }

      const answers = await sessionAnswersDB
        .listBySessionIdForUser(sessionId, userId)
        .catch(() => []);
      const associated = associateAnswersForSession(sessionId, answers ?? []);
      if (associated.length === 0) {
        setState((s) => ({
          ...s,
          scorecard: null,
          status: "not_scored",
          isLoading: false,
          isGenerating: false,
          error: NO_ANSWERS_MESSAGE,
        }));
        return;
      }

      setState((s) => ({
        ...s,
        scorecard: null,
        status: "not_scored",
        isLoading: false,
        isGenerating: false,
        error: describeEvaluation({
          status: "not_scored",
          scorableAnswers: associated.length,
          persistedQuestionScores: 0,
        }),
      }));
    } catch {
      setState((s) => ({
        ...s,
        isLoading: false,
        isGenerating: false,
        status: "failed",
        error: "Failed to load scorecard",
      }));
    }
  }, [sessionId, applyScorecard]);

  const generateScorecard = useCallback(async (): Promise<void> => {
    const userId = useAuthStore.getState().user?.id;
    if (!sessionId || !userId || generateInFlightRef.current) return;
    generateInFlightRef.current = true;

    setState((s) => ({
      ...s,
      status: "pending",
      isLoading: false,
      isGenerating: true,
      error: null,
    }));

    try {
      const answers = await sessionAnswersDB
        .listBySessionIdForUser(sessionId, userId)
        .catch(() => []);
      const associated = associateAnswersForSession(sessionId, answers ?? []);
      if (associated.length === 0) {
        setState((s) => ({
          ...s,
          scorecard: null,
          status: "not_scored",
          isLoading: false,
          isGenerating: false,
          error: NO_ANSWERS_MESSAGE,
        }));
        return;
      }

      try {
        await fetchEdgeJson("generate-scorecard", { session_id: sessionId }, { timeoutMs: 90_000 });
      } catch (err) {
        const timedOut =
          err instanceof ApiClientError &&
          (err.code === "REQUEST_ABORTED" || err.status === 408);
        if (!timedOut) throw err;
        for (let i = 0; i < 10; i += 1) {
          await new Promise((r) => setTimeout(r, 3_000));
          const pending = await scorecardsDB.getBySessionIdForUser(sessionId, userId);
          if (pending) {
            applyScorecard(pending);
            return;
          }
        }
        throw err;
      }
      const created = await scorecardsDB.getBySessionIdForUser(sessionId, userId);
      if (created) {
        applyScorecard(created);
        return;
      }
      setState((s) => ({
        ...s,
        scorecard: null,
        status: "failed",
        isLoading: false,
        isGenerating: false,
        error: "Scoring finished without persisting a scorecard. Retry — scores are not invented in the browser.",
      }));
    } catch (err) {
      const isNotScored =
        err instanceof ApiClientError && err.code === "NOT_SCORED";
      const message = getAiUserFacingError(err);
      setState((s) => ({
        ...s,
        scorecard: null,
        status: isNotScored ? "not_scored" : "failed",
        isLoading: false,
        isGenerating: false,
        error: message,
      }));
    } finally {
      generateInFlightRef.current = false;
    }
  }, [sessionId, applyScorecard]);

  useEffect(() => {
    generateInFlightRef.current = false;
    if (!sessionId) return;
    void loadScorecard();
  }, [sessionId, loadScorecard]);

  const shareScorecard = useCallback(async (): Promise<string | null> => {
    const userId = useAuthStore.getState().user?.id;
    if (!state.scorecard || !userId) return null;
    if (!canShareScorecard(useAuthStore.getState().profile?.privacy_prefs)) {
      const reason =
        "Scorecard sharing is turned off in Settings → Privacy. Turn on “Allow scorecard sharing” to create a public link.";
      setState((s) => ({ ...s, shareBlockedReason: reason }));
      return null;
    }
    const token = generateShareToken();
    const url = buildShareUrl(token);
    try {
      await scorecardsDB.markShared(sessionId, userId, token);
    } catch {
      setState((s) => ({
        ...s,
        shareBlockedReason: "Could not create a share link. Please try again.",
      }));
      return null;
    }
    setState((s) => ({
      ...s,
      isShared: true,
      shareToken: token,
      shareUrl: url,
      shareBlockedReason: null,
    }));
    return url;
  }, [state.scorecard, sessionId]);

  /** Downloads scorecard as JSON (honest name — not a PDF). */
  const exportJSON = useCallback(async (): Promise<void> => {
    if (!state.scorecard) return;

    const json = JSON.stringify(state.scorecard, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clarify-ai-scorecard-${sessionId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state.scorecard, sessionId]);

  /** @deprecated Use exportJSON — kept for call-site compatibility. */
  const exportPDF = exportJSON;

  return {
    ...state,
    generateScorecard,
    shareScorecard,
    exportJSON,
    exportPDF,
    reload: loadScorecard,
  };
}

function generateShareToken(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function buildShareUrl(token: string): string {
  return `${ENV.APP_URL || window.location.origin}/share/${token}`;
}
