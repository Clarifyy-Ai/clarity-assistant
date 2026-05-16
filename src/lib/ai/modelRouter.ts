// src/lib/ai/modelRouter.ts — FIXED
// - Updates Gemini model names to modern 2.5 series
// - Ensures full-answer path passes a model

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

export interface RouteAnswerGenerationOptions {
  questionText: string;
  questionTypeHint?: InterviewType;
  modelHint?: PreferredAIModel | string;
  context: CoachingContext;
  onToken: (chunk: string) => void;
  onDone: (fullText: string) => void;
}

export async function routeAnswerGeneration(
  opts: RouteAnswerGenerationOptions
): Promise<void> {
  const networkStore = useNetworkStore.getState();
  const overlayStore = useOverlayStore.getState();
  const authStore = useAuthStore.getState();

  const isOffline = networkStore.mode === "offline";
  const isDegraded = networkStore.mode === "degraded";

  if (isOffline) {
    const fallback = getResumeFallbackOrTemplate(
      (opts.questionTypeHint ?? "behavioural") as InterviewType,
      opts.context.hint_style
    );
    overlayStore.setOfflineFallback(fallback);
    networkStore.setQueuedHintRequest(true);
    return;
  }

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

  // Map effective model -> Gemini model string for the full-answer EF
  const geminiModelForAnswer =
    effectiveModel === "gemini-pro" ? "gemini-2.5-pro" : "gemini-2.5-flash";

  await streamFullAnswer({
    question: opts.questionText,
    context: opts.context,
    model: geminiModelForAnswer,
    simpleLanguage: opts.context.simple_language ?? false,
    onChunk: (chunk) => opts.onToken(chunk),
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

  if (networkStore.mode === "offline") {
    const fallback = getResumeFallbackOrTemplate(opts.interviewType, opts.context.hint_style);
    overlayStore.setOfflineFallback(fallback);
    networkStore.setQueuedHintRequest(true);
    return;
  }

  const model = selectModel(
    opts.preferredModel,
    opts.interviewType,
    networkStore.mode === "degraded"
  );

  overlayStore.setNetworkColor(networkStore.getOverlayColor());

  try {
    await callModel(model, opts);
  } catch (primaryErr) {
    console.warn(`[ModelRouter] Primary model ${model} failed:`, primaryErr);

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

export function selectModel(
  preferred: PreferredAIModel,
  interviewType: InterviewType,
  isDegraded: boolean
): PreferredAIModel {
  if (isDegraded) return "gemini-flash";
  if (preferred !== "gemini-flash") return preferred;

  const typeModelMap: Partial<Record<InterviewType, PreferredAIModel>> = {
    system_design: "claude",
    leadership: "claude",
    product: "gpt-4o",
    behavioural: "gpt-4o",
    technical: "gemini-pro",
    hr: "gemini-flash",
    mixed: "gemini-pro",
  };

  return typeModelMap[interviewType] ?? "gemini-flash";
}

function getFallbackModel(failed: PreferredAIModel): PreferredAIModel | null {
  const chain: Record<PreferredAIModel, PreferredAIModel | null> = {
    claude: "gpt-4o",
    "gpt-4o": "gemini-pro",
    "gemini-pro": "gemini-flash",
    "gemini-flash": null,
  };
  return chain[failed];
}

async function callModel(model: PreferredAIModel, opts: RouteHintOptions): Promise<void> {
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
        model: "gemini-2.5-flash",
        onDone: wrappedOnDone,
      });

    case "gemini-pro":
      return streamGeminiHint({
        ...opts,
        model: "gemini-2.5-pro",
        onDone: wrappedOnDone,
      });

    case "gpt-4o":
      return streamOpenAIHint({ ...opts, onDone: wrappedOnDone });

    case "claude":
      return streamClaudeHint({ ...opts, onDone: wrappedOnDone });

    default:
      throw new Error(`Unknown model: ${model}`);
  }
}

export function getCreditCost(model: PreferredAIModel): number {
  const costs: Record<PreferredAIModel, number> = {
    "gemini-flash": 1,
    "gemini-pro": 2,
    "gpt-4o": 3,
    claude: 3,
  };
  return costs[model] ?? 1;
}

export function canAffordModel(
  model: PreferredAIModel,
  currentCredits: number,
  isBYOKActive: boolean
): boolean {
  if (isBYOKActive) return true;
  return currentCredits >= getCreditCost(model);
}
