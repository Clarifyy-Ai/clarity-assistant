// src/lib/ai/modelRouter.ts — Multi-model routing for practice coach

import type { PreferredAIModel, HintStyle } from "@/types/user.types";
import type { CoachingContext } from "@/types/ai.types";
import type { InterviewType } from "@/types/session.types";

import { useNetworkStore } from "@/store/networkStore";
import { useAuthStore } from "@/store/userStore";
import { useOverlayStore } from "@/store/overlayStore";
import { clampPreferredModel } from "./modelOptions";

import { streamGeminiHint, streamFullAnswer } from "./geminiClient";
import type { AnswerMode, GeminiModel } from "./geminiClient";
import { streamOpenAIHint } from "./openaiClient";
import { streamClaudeHint } from "./anthropicClient";
import { toDbModel } from "./modelMapping";

import {
  buildOfflineCategoryHint,
  normalizeInterviewType,
} from "./coachQuestionClassify";

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
  sessionId?: string | null;
  /** Sessionless fallback when sessionId is absent (mock | warmup | rehearsal | practice). */
  mode?: string;
  screenshotBase64?: string | null;
  /** Idempotency key for generate-answer credit deduction. */
  idempotencyKey?: string;
  onToken: (chunk: string) => void;
  onDone: (fullText: string) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

function isLiveCoachPath(isLive?: boolean, mode?: string): boolean {
  return Boolean(isLive) || mode === "rehearsal";
}

function applyCategoryFallback(
  question: string,
  sessionType: InterviewType | string | undefined,
  hintStyle: HintStyle,
  reason: "offline" | "ai_unavailable",
  errorMessage?: string | null,
  opts?: { isLive?: boolean; mode?: string },
): void {
  if (isLiveCoachPath(opts?.isLive, opts?.mode)) {
    const overlayStore = useOverlayStore.getState();
    overlayStore.setError(
      errorMessage ??
        (reason === "offline"
          ? "You are offline. Reconnect to get AI coaching."
          : "Coach AI is temporarily unavailable. Try again in a moment."),
    );
    overlayStore.setHintState("idle");
    return;
  }
  const overlayStore = useOverlayStore.getState();
  const built = buildOfflineCategoryHint({
    question,
    sessionType,
    hintStyle,
    resumeTalkingPoints: overlayStore.resume_talking_points,
  });
  overlayStore.setOfflineFallback(built.text, {
    categoryLabel: built.categoryLabel,
    reason,
    errorMessage: errorMessage ?? null,
  });
}

function isGeminiModel(model: PreferredAIModel): boolean {
  return model.startsWith("gemini");
}

export function selectModel(
  preferred: PreferredAIModel,
  _interviewType: InterviewType,
  _isDegraded: boolean
): PreferredAIModel {
  const planId = useAuthStore.getState().planId ?? "free";
  return clampPreferredModel(preferred || "gemini-flash", planId);
}

function getFallbackModel(failed: PreferredAIModel): PreferredAIModel | null {
  if (failed !== "gemini-flash") return "gemini-flash";
  return null;
}

function toGeminiApiModel(model: PreferredAIModel): GeminiModel {
  if (model === "gemini-pro") return "gemini-2.5-pro";
  return "gemini-2.5-flash";
}

async function callModel(
  model: PreferredAIModel,
  opts: RouteHintOptions & { interviewType: InterviewType }
): Promise<void> {
  const start = Date.now();
  const apiModel = toDbModel(model);

  const wrappedOnDone = async (text: string) => {
    useNetworkStore.getState().recordAIResponseTime(Date.now() - start);
    await opts.onDone(text);
  };

  const base = {
    question: opts.question,
    context: opts.context,
    isLive: opts.isLive,
    sessionId: opts.sessionId,
    questionId: opts.questionId,
    simpleLanguage: opts.simpleLanguage,
    callType: opts.callType,
    language: opts.language,
    onChunk: opts.onChunk,
    onDone: wrappedOnDone,
    onError: opts.onError,
    signal: opts.signal,
  };

  if (model.startsWith("gpt")) {
    return streamOpenAIHint({
      ...base,
      model: apiModel,
      mode: opts.isLive ? "rehearsal" : "practice",
    });
  }

  if (model.startsWith("claude")) {
    return streamClaudeHint({
      ...base,
      model: apiModel,
      mode: opts.isLive ? "rehearsal" : "practice",
    });
  }

  return streamGeminiHint({
    ...opts,
    mode: opts.isLive ? "rehearsal" : "practice",
    model: toGeminiApiModel(model),
  });
}

export async function routeAnswerGeneration(opts: RouteAnswerGenerationOptions): Promise<void> {
  const networkStore = useNetworkStore.getState();
  const overlayStore = useOverlayStore.getState();
  const authStore = useAuthStore.getState();

  const isOffline = networkStore.mode === "offline";
  const isDegraded = networkStore.mode === "degraded";
  const interviewType = normalizeInterviewType(opts.questionTypeHint);

  if (isOffline) {
    applyCategoryFallback(
      opts.questionText,
      interviewType,
      opts.context.hint_style,
      "offline",
    );
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
  const apiModel = toDbModel(effectiveModel);

  try {
    await streamFullAnswer({
      question: opts.questionText,
      context: opts.context,
      model: (isGeminiModel(effectiveModel)
        ? toGeminiApiModel(effectiveModel)
        : apiModel) as GeminiModel,
      sessionId: opts.sessionId ?? undefined,
      mode: opts.mode,
      screenshotBase64: opts.screenshotBase64 ?? null,
      simpleLanguage: (opts.context as { simple_language?: boolean }).simple_language ?? false,
      idempotencyKey: opts.idempotencyKey,
      onChunk: (chunk) => opts.onToken(chunk),
      onDone: (fullText) => {
        useNetworkStore.getState().recordAIResponseTime(Date.now() - start);
        opts.onDone(fullText);
      },
      onError: (err) => {
        applyCategoryFallback(
          opts.questionText,
          interviewType,
          opts.context.hint_style,
          "ai_unavailable",
          err instanceof Error ? err.message : String(err),
          { mode: opts.mode },
        );
        opts.onError?.(err);
      },
      signal: opts.signal,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    applyCategoryFallback(
      opts.questionText,
      interviewType,
      opts.context.hint_style,
      "ai_unavailable",
      error.message,
      { mode: opts.mode },
    );
    opts.onError?.(error);
  }
}

export async function routeHint(opts: RouteHintOptions): Promise<void> {
  const overlayStore = useOverlayStore.getState();
  const networkStore = useNetworkStore.getState();
  const interviewType = normalizeInterviewType(opts.interviewType);

  if (opts.answerMode === "full_answer") {
    try {
      overlayStore.setHintState("streaming");
      await routeAnswerGeneration({
        questionText: opts.question,
        questionTypeHint: interviewType,
        modelHint: opts.preferredModel,
        context: opts.context,
        sessionId: opts.sessionId,
      mode: opts.isLive ? "rehearsal" : "mock",
      // Keep full-answer mode aligned with Live vs Mock sessionless rules.
      idempotencyKey: opts.questionId,
        onToken: opts.onChunk,
        onDone: (fullText) => void opts.onDone(fullText),
        onError: (err) => opts.onError(err),
        signal: opts.signal,
      });
    } catch (err) {
      opts.onError(err instanceof Error ? err : new Error(String(err)));
    }
    return;
  }

  if (networkStore.mode === "offline") {
    applyCategoryFallback(
      opts.question,
      interviewType,
      opts.context.hint_style,
      "offline",
      undefined,
      { isLive: opts.isLive },
    );
    networkStore.setQueuedHintRequest(true);
    return;
  }

  const model = selectModel(
    opts.preferredModel,
    interviewType,
    networkStore.mode === "degraded",
  );

  overlayStore.setNetworkColor(networkStore.getOverlayColor());

  try {
    await callModel(model, { ...opts, interviewType });
  } catch (primaryErr) {
    const fallbackModel = getFallbackModel(model);
    if (fallbackModel) {
      try {
        await callModel(fallbackModel, { ...opts, interviewType });
      } catch (fallbackErr) {
        const error =
          fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr));
        applyCategoryFallback(
          opts.question,
          interviewType,
          opts.context.hint_style,
          "ai_unavailable",
          error.message,
          { isLive: opts.isLive },
        );
        opts.onError(error);
      }
    } else {
      const error =
        primaryErr instanceof Error ? primaryErr : new Error(String(primaryErr));
      applyCategoryFallback(
        opts.question,
        interviewType,
        opts.context.hint_style,
        "ai_unavailable",
        error.message,
        { isLive: opts.isLive },
      );
      opts.onError(error);
    }
  }
}
