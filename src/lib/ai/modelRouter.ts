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
//
// IMPORTANT — multi-provider routing actually happens server-side:
//   - The frontend clients all proxy through Supabase Edge Functions.
//   - Provider dispatch lives in `_shared/utils.ts` callAI() on the
//     backend, using PROVIDER_MAP to route by model id.
//   - BYOK keys are attached as x-byok-{provider} headers on EF calls.
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
// Pipeline-facing Stage 4 API (full answer generation)
// Used by src/lib/ai/answerGenerationPipeline.ts
// ─────────────────────────────────────────────────────────────────

export interface RouteAnswerGenerationOptions {
  questionText: string;
  questionTypeHint?: InterviewType;
  modelHint?: PreferredAIModel | string;
  context: CoachingContext;
  onToken: (chunk: string) => void;
  onDone: (fullText: string) => void;
}

/**
 * Stage 4 – AI Generation for the 6‑stage pipeline.
 * For v1 this calls the generate-answer EF via Gemini, while still
 * running client-side model selection to support metrics/logging. [file:1][file:3]
 */
export async function routeAnswerGeneration(
  opts: RouteAnswerGenerationOptions
): Promise<void> {
  const networkStore = useNetworkStore.getState();
  const overlayStore = useOverlayStore.getState();
  const authStore    = useAuthStore.getState();

  const isOffline  = networkStore.mode === "offline";
  const isDegraded = networkStore.mode === "degraded";

  // Offline: immediate resume/template fallback, queue real request. [file:3]
  if (isOffline) {
    const fallback = getResumeFallbackOrTemplate(
      (opts.questionTypeHint ?? "behavioural") as InterviewType,
      opts.context.hint_style
    );
    overlayStore.setOfflineFallback(fallback);
    networkStore.setQueuedHintRequest(true);
    return;
  }

  // Derive preferred model from user settings or hint
  const preferred =
    (opts.modelHint as PreferredAIModel | undefined) ??
    (authStore.profile?.preferred_model as PreferredAIModel | undefined) ??
    ("gemini-flash" as PreferredAIModel);

  const effectiveModel = selectModel(
    preferred,
    (opts.questionTypeHint ?? "behavioural") as InterviewType,
    isDegraded
  );

  overlayStore.setNetworkColor(networkStore.getOverlayColor());

  const start = Date.now();

  // NOTE: server-side generate-answer can later route Claude/GPT‑4o/Gemini
  // based on effectiveModel; client only cares about streaming. [file:1][file:3]
  await streamFullAnswer({
    question: opts.questionText,
    context:  opts.context,
    simpleLanguage: opts.context.simple_language ?? false,
    onChunk: (chunk) => {
      opts.onToken(chunk);
    },
    onDone: (fullText) => {
      const elapsed = Date.now() - start;
      useNetworkStore.getState().recordAIResponseTime(elapsed);
      opts.onDone(fullText);
    },
    onError: (err) => {
      console.error("[ModelRouter] routeAnswerGeneration error:", err);
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// Helpers
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

// ─────────────────────────────────────────────────────────────────
// Main router entry point (hint + full answer from overlay)
// ─────────────────────────────────────────────────────────────────

export async function routeHint(opts: RouteHintOptions): Promise<void> {
  // Full answer mode → delegate to pipeline-style Stage 4 wrapper. [file:1][file:3]
  if (opts.answerMode === "full_answer") {
    try {
      const overlayStore = useOverlayStore.getState();
      overlayStore.setHintState("streaming");

      await routeAnswerGeneration({
        questionText: opts.question,
        questionTypeHint: opts.interviewType,
        modelHint: opts.preferredModel,
        context: opts.context,
        onToken: opts.onChunk,
        onDone: opts.onDone,
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
    const fallback = getResumeFallbackOrTemplate(
      opts.interviewType,
      opts.context.hint_style
    );
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
        console.error(
          `[ModelRouter] Fallback model ${fallbackModel} also failed.`
        );
        const fallback = getResumeFallbackOrTemplate(
          opts.interviewType,
          opts.context.hint_style
        );
        overlayStore.setOfflineFallback(fallback);
        opts.onError(
          fallbackErr instanceof Error
            ? fallbackErr
            : new Error(String(fallbackErr))
        );
      }
    } else {
      const fallback = getResumeFallbackOrTemplate(
        opts.interviewType,
        opts.context.hint_style
      );
      overlayStore.setOfflineFallback(fallback);
      opts.onError(
        primaryErr instanceof Error
          ? primaryErr
          : new Error(String(primaryErr))
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Model selection logic (matches manual: Ch. 8.2)
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
  // Manual mapping: System Design/Technical → Claude; Behavioral/Leadership → GPT‑4o;
  // HR/simple → Gemini Flash; generic/other → Gemini Pro. [file:1][file:3]
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
    claude:       "gpt-4o",
    "gpt-4o":     "gemini-pro",
    "gemini-pro": "gemini-flash",
    "gemini-flash": null,
  };
  return chain[failed];
}

// ─────────────────────────────────────────────────────────────────
// Dispatch to correct client (hint mode)
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
    claude:         3,
  };
  return costs[model] ?? 1;
}

// ─────────────────────────────────────────────────────────────────
// Guard — check credits before routing
// (actual deduction happens in Blocker 4 via Edge Functions)
// ─────────────────────────────────────────────────────────────────

export function canAffordModel(
  model: PreferredAIModel,
  currentCredits: number,
  isBYOKActive: boolean
): boolean {
  if (isBYOKActive) return true;
  return currentCredits >= getCreditCost(model);
}
