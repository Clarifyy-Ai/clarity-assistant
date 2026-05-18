// src/lib/ai/modelRouter.ts — PRODUCTION FIXED
// - => opts.onDone(fullText),// - Supports both "behavioral" and "behavioural"
        onError: (e) => opts.onError(e),
        signal: opts.signal,
      });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      opts.onError(e);
    }
    return;
  }

  // Offline fallback
  if (networkStore.mode === "offline") {
    const fallback = getResumeFallbackOrTemplate(interviewType, opts.context.hint_style);
    overlayStore.setOfflineFallback(fallback);
    networkStore.setQueuedHintRequest(true);
    return;
  }

  const model = selectModel(
    opts.preferredModel,
    interviewType,
    networkStore.mode === "degraded"
  );

  overlayStore.setNetworkColor(networkStore.getOverlayColor());

  try {
    await callModel(model, { ...opts, interviewType });
  } catch (primaryErr) {
    console.warn(`[ModelRouter] Primary model ${model} failed:`, primaryErr);

    const fallbackModel = getFallbackModel(model);
    if (fallbackModel) {
      try {
        await callModel(fallbackModel, { ...opts, interviewType });
      } catch (fallbackErr) {
        const fallback = getResumeFallbackOrTemplate(interviewType, opts.context.hint_style);
        overlayStore.setOfflineFallback(fallback);
        opts.onError(fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr)));
      }
    } else {
      const fallback = getResumeFallbackOrTemplate(interviewType, opts.context.hint_style);
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

async function callModel(model: PreferredAIModel, opts: RouteHintOptions & { interviewType: InterviewType }): Promise<void> {
  const start = Date.now();

  const wrappedOnDone = async (text: string) => {
    const elapsed = Date.now() - start;
    useNetwork
// - Removes @ts-nocheck with safe typing
// - Ensures full-answer path calls onError on failure
// - Keeps routing, fallback, offline templates, resume fallback intact

import type { PreferredAIModel, HintStyle } from "@/types/user.types";
import type { CoachingContext } from "@/types/ai.types";
import type { InterviewType } from "@/types/session.types";

import { useNetworkStore } from "@/store/networkStore";
import { useAuthStore } from "@/store/userStore";
import { useOverlayStore } from "@/store/overlayStore";

import { streamGeminiHint, streamFullAnswer } from "./geminiClient";
import type { AnswerMode } from "./geminiClient";
import { streamOpenAIHint } from "./openaiClient";
import { streamClaudeHint } from "./anthropicClient";

import { getOfflineTemplate } from "./offlineTemplates";
import { formatTalkingPointsAsHint } from "./resumeFallback";

export interface RouteHintOptions {
  question: string;
  context: CoachingContext;
  preferredModel: PreferredAIModel;
  interviewType: InterviewType | string;
  isLive: boolean;
  sessionId: string;
  questionId: string;
  screenshotBase64?: string | null;
  simpleLanguage?: boolean;
  callType?: "interview" | "regular_call";
  language?: string;
  answerMode?: AnswerMode;
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void | Promise<void>;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}

export interface RouteAnswerGenerationOptions {
  questionText: string;
  questionTypeHint?: InterviewType | string;
  modelHint?: PreferredAIModel | string;
  context: CoachingContext;
  onToken: (chunk: string) => void;
  onDone: (fullText: string) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

/**
 * Normalize interviewType so the router works even when parts of the app
 * use "behavioral" and others use "behavioural".
 */
function normalizeInterviewType(input: InterviewType | string | undefined): InterviewType {
  const raw = String(input ?? "").toLowerCase();

  // Accept both spellings
  if (raw === "behavioral") return "behavioural" as InterviewType;
  if (raw === "behavioural") return "behavioural" as InterviewType;

  // Pass through known ones
  return (input as InterviewType) ?? ("behavioural" as InterviewType);
}

function getResumeFallbackOrTemplate(interviewType: InterviewType, hintStyle: HintStyle): string {
  const overlayStore = useOverlayStore.getState();
  const tp = overlayStore.resume_talking_points;
  if (tp) return formatTalkingPointsAsHint(tp);
  return getOfflineTemplate(interviewType, hintStyle);
}

export async function routeAnswerGeneration(opts: RouteAnswerGenerationOptions): Promise<void> {
  const networkStore = useNetworkStore.getState();
  const overlayStore = useOverlayStore.getState();
  const authStore = useAuthStore.getState();

  const isOffline = networkStore.mode === "offline";
  const isDegraded = networkStore.mode === "degraded";

  const interviewType = normalizeInterviewType(opts.questionTypeHint);

  if (isOffline) {
    const fallback = getResumeFallbackOrTemplate(interviewType, opts.context.hint_style);
    overlayStore.setOfflineFallback(fallback);
    networkStore.setQueuedHintRequest(true);
    return;
  }

  const preferred =
    (opts.modelHint as PreferredAIModel | undefined) ??
    (authStore.profile?.preferred_model as PreferredAIModel | undefined) ??
    ("gemini-flash" as PreferredAIModel);

  const effectiveModel = selectModel(preferred, interviewType, isDegraded);

  overlayStore.setNetworkColor(networkStore.getOverlayColor());

  const start = Date.now();

  // Full-answer is routed through Gemini full-answer streaming
  const geminiModelForAnswer =
    effectiveModel === "gemini-pro" ? "gemini-2.5-pro" : "gemini-2.5-flash";

  try {
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
        opts.onError?.(err);
      },
      signal: opts.signal,
    });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    opts.onError?.(e);
  }
}

export async function routeHint(opts: RouteHintOptions): Promise<void> {
  const overlayStore = useOverlayStore.getState();
  const networkStore = useNetworkStore.getState();

  const interviewType = normalizeInterviewType(opts.interviewType);

  // Full answer path
  if (opts.answerMode === "full_answer") {
    try {
      overlayStore.setHintState("streaming");

      await routeAnswerGeneration({
        questionText: opts.question,
        questionTypeHint: interviewType,
        modelHint: opts.preferredModel,
        context: opts.context,
        onToken: opts.onChunk,
