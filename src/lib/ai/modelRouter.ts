// @ts-nocheck
import type { PreferredAIModel } from "@/types/user.types";
import type { CoachingContext } from "@/types/ai.types";
import type { InterviewType } from "@/types/session.types";
import { useNetworkStore } from "@/store/networkStore";
import { useAuthStore } from "@/store/userStore";
import { streamGeminiHint, streamFullAnswer } from "./geminiClient";
import type { AnswerMode } from "./geminiClient";
import { streamOpenAIHint } from "./openaiClient";
import { streamClaudeHint } from "./anthropicClient";
import { getOfflineTemplate } from "./offlineTemplates";
import { formatTalkingPointsAsHint } from "./resumeFallback";
import { useOverlayStore } from "@/store/overlayStore";

// ─────────────────────────────────────────────────────────────────
// Model Router
// Intelligently selects which AI model to use based on:
//   1. Network quality (auto-downgrade on degraded)
//   2. Interview type (route to best model for each type)
//   3. User preference
//   4. BYOK status
//   5. Primary model failure → automatic fallback chain
// ─────────────────────────────────────────────────────────────────

export interface RouteHintOptions {
  question: string;
  context: CoachingContext;
  preferredModel: PreferredAIModel;
  interviewType: InterviewType;
  isLive: boolean;
  sessionId: string;
  questionId: string;
  screenshotBase64?: string | null;
  simpleLanguage?: boolean;
  callType?: "interview" | "regular_call";
  language?: string;
  answerMode?: AnswerMode;
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}

// ─────────────────────────────────────────────────────────────────
// Main router entry point
// ─────────────────────────────────────────────────────────────────

function getResumeFallbackOrTemplate(
  interviewType: InterviewType,
  hintStyle: import("@/types/user.types").HintStyle
): string {
  const overlayStore = useOverlayStore.getState();
  const tp = overlayStore.resume_talking_points;
  if (tp) return formatTalkingPointsAsHint(tp);
  return getOfflineTemplate(interviewType, hintStyle);
}

export async function routeHint(opts: RouteHintOptions): Promise<void> {
  // If full_answer mode, bypass model selection and go directly to generate-answer
  if (opts.answerMode === "full_answer") {
    try {
      const overlayStore = useOverlayStore.getState();
      overlayStore.setHintState("streaming");
      await streamFullAnswer({
        ...opts,
        model: "gemini-1.5-flash",
      });
    } catch (err) {
      console.error("[ModelRouter] Full answer failed:", err);
      opts.onError(err instanceof Error ? err : new Error(String(err)));
    }
    return;
  }

  const networkStore = useNetworkStore.getState();
  const overlayStore = useOverlayStore.getState();

  // ── Offline fallback — serve immediately, queue real request ──
  if (networkStore.mode === "offline") {
    const fallback = getResumeFallbackOrTemplate(opts.interviewType, opts.context.hint_style);
    overlayStore.setOfflineFallback(fallback);
    networkStore.setQueuedHintRequest(true);
    return;
  }

  // ── Select effective model ────────────────────────────────────
  const model = selectModel(
    opts.preferredModel,
    opts.interviewType,
    networkStore.mode === "degraded"
  );

  // ── Update overlay color from network ─────────────────────────
  overlayStore.setNetworkColor(networkStore.getOverlayColor());

  // ── Primary attempt ───────────────────────────────────────────
  try {
    await callModel(model, opts);
  } catch (primaryErr) {
    console.warn(`[ModelRouter] Primary model ${model} failed:`, primaryErr);

    // ── Fallback chain ─────────────────────────────────────────
    const fallbackModel = getFallbackModel(model);
    if (fallbackModel) {
      try {
        await callModel(fallbackModel, opts);
      } catch (fallbackErr) {
        console.error(`[ModelRouter] Fallback model ${fallbackModel} also failed.`);
        const fallback = getResumeFallbackOrTemplate(opts.interviewType, opts.context.hint_style);
        overlayStore.setOfflineFallback(fallback);
        opts.onError(fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr)));
      }
    } else {
      const fallback = getResumeFallbackOrTemplate(opts.interviewType, opts.context.hint_style);
      overlayStore.setOfflineFallback(fallback);
      opts.onError(primaryErr instanceof Error ? primaryErr : new Error(String(primaryErr)));
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Model selection logic
// ─────────────────────────────────────────────────────────────────

export function selectModel(
  preferred: PreferredAIModel,
  interviewType: InterviewType,
  isDegraded: boolean
): PreferredAIModel {
  // Always use Flash on degraded network — speed over quality
  if (isDegraded) return "gemini-flash";

  // If user has a preferred model, respect it
  if (preferred !== "gemini-flash") return preferred;

  // Auto-route by interview type when user chose Flash (default)
  const typeModelMap: Partial<Record<InterviewType, PreferredAIModel>> = {
    system_design: "claude",
    leadership:    "claude",
    product:       "gpt-4o",
    behavioural:   "gpt-4o",
    technical:     "gemini-pro",
    hr:            "gemini-flash",
    mixed:         "gemini-pro",
  };

  return typeModelMap[interviewType] ?? "gemini-flash";
}

// ─────────────────────────────────────────────────────────────────
// Fallback chain
// ─────────────────────────────────────────────────────────────────

function getFallbackModel(failed: PreferredAIModel): PreferredAIModel | null {
  const chain: Record<PreferredAIModel, PreferredAIModel | null> = {
    "claude":        "gpt-4o",
    "gpt-4o":        "gemini-pro",
    "gemini-pro":    "gemini-flash",
    "gemini-flash":  null,
  };
  return chain[failed];
}

// ─────────────────────────────────────────────────────────────────
// Dispatch to correct client
// ─────────────────────────────────────────────────────────────────

async function callModel(
  model: PreferredAIModel,
  opts: RouteHintOptions
): Promise<void> {
  const start = Date.now();

  const wrappedOnDone = (text: string) => {
    const elapsed = Date.now() - start;
    useNetworkStore.getState().recordAIResponseTime(elapsed);
    opts.onDone(text);
  };

  switch (model) {
    case "gemini-flash":
      return streamGeminiHint({
        ...opts,
        model: "gemini-1.5-flash",
        onDone: wrappedOnDone,
      });

    case "gemini-pro":
      return streamGeminiHint({
        ...opts,
        model: "gemini-1.5-pro",
        onDone: wrappedOnDone,
      });

    case "gpt-4o":
      return streamOpenAIHint({
        ...opts,
        onDone: wrappedOnDone,
      });

    case "claude":
      return streamClaudeHint({
        ...opts,
        onDone: wrappedOnDone,
      });

    default:
      throw new Error(`Unknown model: ${model}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// Credit cost calculator
// ─────────────────────────────────────────────────────────────────

export function getCreditCost(model: PreferredAIModel): number {
  const costs: Record<PreferredAIModel, number> = {
    "gemini-flash": 1,
    "gemini-pro":   2,
    "gpt-4o":       3,
    "claude":       3,
  };
  return costs[model] ?? 1;
}

// ─────────────────────────────────────────────────────────────────
// Guard — check credits before routing
// ─────────────────────────────────────────────────────────────────

export function canAffordModel(
  model: PreferredAIModel,
  currentCredits: number,
  isBYOKActive: boolean
): boolean {
  if (isBYOKActive) return true;
  return currentCredits >= getCreditCost(model);
}
