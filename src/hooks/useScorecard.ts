import { ENV } from "@/lib/env";
import { useState, useEffect, useCallback, useRef } from "react";
import { scorecardsDB, sessionAnswersDB } from "@/lib/supabase/database";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { ApiClientError } from "@/lib/api/apiClient";
import {
  getAiUserFacingError,
  isInsufficientCreditsError,
  openUpgradeIfInsufficientCredits,
  openUpgradeIfCapabilityRequired,
} from "@/lib/network/aiErrorUx";
import { evaluateActionCreditGate } from "@/lib/billing/actionCreditGate";
import { resolveCreditBalance } from "@/lib/billing/resolveCreditBalance";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import { useAuthStore } from "@/store/userStore";
import type { Scorecard } from "@/types/scorecard.types";
import type { ScorecardUiStatus } from "@/lib/analytics/scoreStatus";
import {
  associateAnswersForSession,
} from "@/lib/scorecard/evaluation";
import {
  eligibilityFromEvaluationStatus,
  isScorecardEligibilityCode,
  resolveScorecardEligibility,
  scorecardEligibilityMessage,
  type ScorecardEligibilityCode,
} from "@/lib/scorecard/eligibility";
import { brandExportBasename } from "@/lib/constants/brandStorage";
import { issueShareToken } from "@/lib/session/issueShareToken";

/** Poll while Edge evaluation is still queued/processing (matches UX copy). */
const PENDING_POLL_MS = 3_000;
const PENDING_POLL_MAX_MS = 90_000;

interface UseScorecardOptions {
  sessionId: string;
}

interface ScorecardState {
  scorecard: Scorecard | null;
  status: ScorecardUiStatus;
  eligibilityCode: ScorecardEligibilityCode | null;
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  isShared: boolean;
  shareUrl: string | null;
  shareToken: string | null;
  shareBlockedReason: string | null;
  creditRequired: number | null;
  creditBalance: number | null;
}

/** Authoritative completed scorecard — finite overall + evaluation_status=completed. */
export function isCompletedScorecard(
  row: Pick<Scorecard, "overall_score" | "evaluation_status"> | null | undefined,
): boolean {
  if (!row) return false;
  return (
    row.evaluation_status === "completed" &&
    typeof row.overall_score === "number" &&
    Number.isFinite(row.overall_score)
  );
}

function uiStatusFromScorecard(existing: Scorecard): {
  status: ScorecardUiStatus;
  eligibilityCode: ScorecardEligibilityCode | null;
  error: string | null;
} {
  const fromEval = eligibilityFromEvaluationStatus(
    existing.evaluation_status,
    existing.overall_score,
  );
  if (fromEval === "EVALUATION_PROCESSING") {
    return {
      status: "pending",
      eligibilityCode: fromEval,
      error: scorecardEligibilityMessage(fromEval),
    };
  }
  if (fromEval === "EVALUATION_FAILED") {
    return {
      status: "failed",
      eligibilityCode: fromEval,
      error:
        existing.last_error_code
          ? `${scorecardEligibilityMessage(fromEval)} (${existing.last_error_code})`
          : scorecardEligibilityMessage(fromEval),
    };
  }
  if (fromEval === "NOT_ELIGIBLE_NO_ANSWERS" || existing.evaluation_status === "not_eligible") {
    const code =
      (isScorecardEligibilityCode(existing.eligibility_reason)
        ? existing.eligibility_reason
        : "NOT_ELIGIBLE_NO_ANSWERS");
    return {
      status: "not_scored",
      eligibilityCode: code,
      error: scorecardEligibilityMessage(code),
    };
  }

  // Honest eligibility: require explicit completed status — never treat a bare overall_score
  // (legacy / missing evaluation_status) as a finished scorecard.
  if (isCompletedScorecard(existing)) {
    return { status: "scored", eligibilityCode: "SCORECARD_ELIGIBLE", error: null };
  }
  if (
    existing.evaluation_status === "queued" ||
    existing.evaluation_status === "processing" ||
    (existing.question_scores.length > 0 &&
      !(typeof existing.overall_score === "number" && Number.isFinite(existing.overall_score)))
  ) {
    return {
      status: "pending",
      eligibilityCode: "EVALUATION_PROCESSING",
      error: scorecardEligibilityMessage("EVALUATION_PROCESSING"),
    };
  }
  if (
    typeof existing.overall_score === "number" &&
    Number.isFinite(existing.overall_score) &&
    !existing.evaluation_status
  ) {
    return {
      status: "not_scored",
      eligibilityCode: "EVALUATION_FAILED",
      error:
        "This scorecard is missing an evaluation status and cannot be shown as completed.",
    };
  }
  return {
    status: "not_scored",
    eligibilityCode: "NOT_ELIGIBLE_NO_ANSWERS",
    error: scorecardEligibilityMessage("NOT_ELIGIBLE_NO_ANSWERS"),
  };
}

/**
 * Scorecards are authoritative only when persisted in `scorecards`.
 * Mount/refresh only reads the DB. AI generate-scorecard is an explicit user action.
 * While evaluation_status is queued/processing, poll until completed/failed or timeout.
 */
export function useScorecard({ sessionId }: UseScorecardOptions) {
  const generateInFlightRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartedAtRef = useRef<number | null>(null);

  const [state, setState] = useState<ScorecardState>({
    scorecard: null,
    status: "loading",
    eligibilityCode: null,
    isLoading: true,
    isGenerating: false,
    error: null,
    isShared: false,
    shareUrl: null,
    shareToken: null,
    shareBlockedReason: null,
    creditRequired: null,
    creditBalance: null,
  });

  const stopPendingPoll = useCallback(() => {
    if (pollTimerRef.current != null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollStartedAtRef.current = null;
  }, []);

  const applyScorecard = useCallback((existing: Scorecard) => {
    const mapped = uiStatusFromScorecard(existing);
    setState((s) => ({
      ...s,
      scorecard: existing,
      status: mapped.status,
      eligibilityCode: mapped.eligibilityCode,
      isLoading: false,
      isGenerating: false,
      error: mapped.error,
      isShared: existing.is_shared,
      shareToken: existing.share_token,
      shareUrl: existing.share_token ? buildShareUrl(existing.share_token) : null,
    }));
    return mapped.status;
  }, []);

  const markPollTimedOut = useCallback(() => {
    stopPendingPoll();
    setState((s) => ({
      ...s,
      status: "failed",
      eligibilityCode: "EVALUATION_FAILED",
      isLoading: false,
      isGenerating: false,
      error:
        "Scorecard evaluation is taking too long. Retry when you are ready — scores are not invented in the browser.",
    }));
  }, [stopPendingPoll]);

  const startPendingPoll = useCallback(() => {
    if (pollTimerRef.current != null) return;
    pollStartedAtRef.current = Date.now();
    pollTimerRef.current = setInterval(() => {
      void (async () => {
        const userId = useAuthStore.getState().user?.id;
        if (!userId || !sessionId) {
          stopPendingPoll();
          return;
        }
        const started = pollStartedAtRef.current ?? Date.now();
        if (Date.now() - started >= PENDING_POLL_MAX_MS) {
          markPollTimedOut();
          return;
        }
        try {
          const row = await scorecardsDB.getBySessionIdForUser(sessionId, userId);
          if (!row) return;
          const next = applyScorecard(row);
          if (next !== "pending") {
            stopPendingPoll();
          }
        } catch {
          // Keep polling until timeout; transient read errors are retryable.
        }
      })();
    }, PENDING_POLL_MS);
  }, [sessionId, applyScorecard, stopPendingPoll, markPollTimedOut]);

  const loadScorecard = useCallback(async (): Promise<void> => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      stopPendingPoll();
      setState((s) => ({
        ...s,
        isLoading: false,
        isGenerating: false,
        status: "failed",
        eligibilityCode: "EVALUATION_FAILED",
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
        const next = applyScorecard(existing);
        if (next === "pending") startPendingPoll();
        else stopPendingPoll();
        return;
      }

      stopPendingPoll();
      const answers = await sessionAnswersDB
        .listBySessionIdForUser(sessionId, userId)
        .catch(() => []);
      const associated = associateAnswersForSession(sessionId, answers ?? []);
      const eligibility = resolveScorecardEligibility({
        sessionCompleted: true,
        scorableAnswerCount: associated.length,
      });
      setState((s) => ({
        ...s,
        scorecard: null,
        status: "not_scored",
        eligibilityCode: eligibility.code,
        isLoading: false,
        isGenerating: false,
        error: eligibility.message,
      }));
    } catch {
      stopPendingPoll();
      setState((s) => ({
        ...s,
        isLoading: false,
        isGenerating: false,
        status: "failed",
        eligibilityCode: "EVALUATION_FAILED",
        error: scorecardEligibilityMessage("EVALUATION_FAILED"),
      }));
    }
  }, [sessionId, applyScorecard, startPendingPoll, stopPendingPoll]);

  const generateScorecard = useCallback(async (): Promise<void> => {
    const auth = useAuthStore.getState();
    const userId = auth.user?.id;
    if (!sessionId || !userId || generateInFlightRef.current) return;

    const { balance, known } = resolveCreditBalance({
      isProfileLoaded: auth.isProfileLoaded,
      profileCredits: auth.profile?.credits,
      storeCredits: auth.credits,
    });
    const gate = evaluateActionCreditGate({
      operationKey: "generate_scorecard",
      balance: known ? balance : null,
      balanceKnown: known,
    });
    // Only block when balance is known and insufficient. Unknown balance → server decides.
    if (gate.status === "insufficient") {
      openUpgradeIfInsufficientCredits(
        new ApiClientError({
          message: scorecardEligibilityMessage("INSUFFICIENT_CREDITS"),
          status: 402,
          code: "INSUFFICIENT_CREDITS",
        }),
      );
      setState((s) => ({
        ...s,
        scorecard: null,
        status: "failed",
        eligibilityCode: "INSUFFICIENT_CREDITS",
        isLoading: false,
        isGenerating: false,
        error: scorecardEligibilityMessage("INSUFFICIENT_CREDITS"),
        creditRequired: AI_CREDIT_COSTS.generate_scorecard,
        creditBalance: gate.balance,
      }));
      return;
    }

    generateInFlightRef.current = true;
    stopPendingPoll();

    setState((s) => ({
      ...s,
      status: "pending",
      eligibilityCode: "EVALUATION_PROCESSING",
      isLoading: false,
      isGenerating: true,
      error: scorecardEligibilityMessage("EVALUATION_PROCESSING"),
      creditRequired: null,
      creditBalance: null,
    }));

    try {
      const answers = await sessionAnswersDB
        .listBySessionIdForUser(sessionId, userId)
        .catch(() => []);
      const associated = associateAnswersForSession(sessionId, answers ?? []);
      const eligibility = resolveScorecardEligibility({
        sessionCompleted: true,
        scorableAnswerCount: associated.length,
      });
      if (!eligibility.eligible) {
        setState((s) => ({
          ...s,
          scorecard: null,
          status: "not_scored",
          eligibilityCode: eligibility.code,
          isLoading: false,
          isGenerating: false,
          error: eligibility.message,
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
        // Client timed out while Edge may still be writing — poll for completion.
        startPendingPoll();
        for (let i = 0; i < 10; i += 1) {
          await new Promise((r) => setTimeout(r, PENDING_POLL_MS));
          const pending = await scorecardsDB.getBySessionIdForUser(sessionId, userId);
          if (pending) {
            const next = applyScorecard(pending);
            if (next !== "pending") {
              stopPendingPoll();
              return;
            }
          }
        }
        // Leave pending poll running for the remainder of PENDING_POLL_MAX_MS.
        return;
      }
      const created = await scorecardsDB.getBySessionIdForUser(sessionId, userId);
      if (created) {
        const next = applyScorecard(created);
        if (next === "pending") startPendingPoll();
        else stopPendingPoll();
        return;
      }
      setState((s) => ({
        ...s,
        scorecard: null,
        status: "failed",
        eligibilityCode: "EVALUATION_FAILED",
        isLoading: false,
        isGenerating: false,
        error: scorecardEligibilityMessage("EVALUATION_FAILED"),
      }));
    } catch (err) {
      if (isInsufficientCreditsError(err)) {
        openUpgradeIfInsufficientCredits(err);
        setState((s) => ({
          ...s,
          scorecard: null,
          status: "failed",
          eligibilityCode: "INSUFFICIENT_CREDITS",
          isLoading: false,
          isGenerating: false,
          error: scorecardEligibilityMessage("INSUFFICIENT_CREDITS"),
          creditRequired: AI_CREDIT_COSTS.generate_scorecard,
          creditBalance: null,
        }));
        return;
      }
      openUpgradeIfCapabilityRequired(err);
      const code =
        err instanceof ApiClientError && typeof err.code === "string" ? err.code : null;
      const eligibilityCode: ScorecardEligibilityCode =
        code === "NOT_ELIGIBLE_NO_ANSWERS" || code === "NOT_SCORED"
          ? "NOT_ELIGIBLE_NO_ANSWERS"
          : code === "NOT_ELIGIBLE_INCOMPLETE_SESSION" || code === "SESSION_NOT_COMPLETED"
            ? "NOT_ELIGIBLE_INCOMPLETE_SESSION"
            : code === "FEATURE_NOT_AVAILABLE_FOR_PLAN" || code === "CAPABILITY_REQUIRED"
              ? "FEATURE_NOT_AVAILABLE_FOR_PLAN"
              : code === "EVALUATION_PROCESSING"
                ? "EVALUATION_PROCESSING"
                : "EVALUATION_FAILED";
      const message =
        scorecardEligibilityMessage(eligibilityCode) || getAiUserFacingError(err);
      setState((s) => ({
        ...s,
        scorecard: null,
        status:
          eligibilityCode === "EVALUATION_PROCESSING"
            ? "pending"
            : eligibilityCode === "EVALUATION_FAILED" ||
                eligibilityCode === "FEATURE_NOT_AVAILABLE_FOR_PLAN"
              ? "failed"
              : "not_scored",
        eligibilityCode,
        isLoading: false,
        isGenerating: false,
        error: message,
      }));
      if (eligibilityCode === "EVALUATION_PROCESSING") {
        startPendingPoll();
      }
    } finally {
      generateInFlightRef.current = false;
    }
  }, [sessionId, applyScorecard, startPendingPoll, stopPendingPoll]);

  useEffect(() => {
    generateInFlightRef.current = false;
    if (!sessionId) return;
    void loadScorecard();
    return () => {
      stopPendingPoll();
    };
  }, [sessionId, loadScorecard, stopPendingPoll]);

  const shareScorecard = useCallback(async (): Promise<string | null> => {
    const userId = useAuthStore.getState().user?.id;
    if (!state.scorecard || !userId) return null;
    try {
      const issued = await issueShareToken(sessionId, "issue");
      const token =
        typeof issued.share_token === "string" && issued.share_token.trim().length >= 16
          ? issued.share_token.trim()
          : null;
      if (!token) {
        const reason =
          issued.error ||
          issued.message ||
          (issued.code === "SHARE_DISABLED"
            ? "Scorecard sharing is turned off in Settings → Privacy. Turn on “Allow scorecard sharing” to create a public link."
            : "Could not create a share link. Please try again.");
        setState((s) => ({ ...s, shareBlockedReason: reason }));
        return null;
      }
      const url = buildShareUrl(token);
      setState((s) => ({
        ...s,
        isShared: true,
        shareToken: token,
        shareUrl: url,
        shareBlockedReason: null,
      }));
      return url;
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : null;
      const msg = err instanceof Error ? err.message : "";
      const privacyBlocked =
        code === "SHARE_DISABLED" || /privacy|sharing is turned off/i.test(msg);
      setState((s) => ({
        ...s,
        shareBlockedReason: privacyBlocked
          ? "Scorecard sharing is turned off in Settings → Privacy. Turn on “Allow scorecard sharing” to create a public link."
          : code === "SESSION_INCOMPLETE"
            ? "This session is still in progress, so a share link cannot be created yet."
            : code === "SCORECARD_REQUIRED"
              ? "Session is complete — generate a scorecard before sharing."
              : "Could not create a share link. Please try again.",
      }));
      return null;
    }
  }, [state.scorecard, sessionId]);

  /** Downloads scorecard as JSON (debug / data export). */
  const exportJSON = useCallback(async (): Promise<void> => {
    if (!state.scorecard) return;

    const json = JSON.stringify(state.scorecard, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${brandExportBasename("scorecard", sessionId.slice(0, 8))}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state.scorecard, sessionId]);

  /** Real PDF via jsPDF — never renames JSON to .pdf. */
  const exportPDF = useCallback(async (): Promise<void> => {
    if (!state.scorecard) return;
    const { exportScorecardPdf } = await import("@/lib/export/scorecardPdf");
    exportScorecardPdf(state.scorecard, { sessionIdHint: sessionId });
  }, [state.scorecard, sessionId]);

  return {
    ...state,
    generateScorecard,
    shareScorecard,
    exportJSON,
    exportPDF,
    reload: loadScorecard,
  };
}

function buildShareUrl(token: string): string {
  return `${ENV.APP_URL || window.location.origin}/share/${token}`;
}
