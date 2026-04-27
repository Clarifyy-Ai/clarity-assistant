// src/lib/ai/answerGenerationPipeline.ts

import { detectQuestion } from "./questionDetection";
import { buildContextEnvelope } from "./contextBuilder";
import { routeAnswerGeneration } from "./modelRouter";
import { appendStreamChunk, commitStreamedAnswer } from "./streamingRenderer";
import { useOverlayStore } from "@/store/overlayStore";

export type QuestionType =
  | "behavioral"
  | "technical"
  | "system-design"
  | "leadership"
  | "hr-generic";

export interface AnswerGenerationOptions {
  userId: string;
  sessionId: string;
  transcript: string;
  /** Optional explicit question text override (e.g. from UI click) */
  explicitQuestionText?: string;
  /** Optional hint to routing (behavioral / technical / etc.) */
  questionTypeHint?: QuestionType;
  /** Optional preferred model (GPT‑4o, Claude, Gemini, BYOK key name) */
  modelHint?: string;
}

export interface PipelineStageLatency {
  detection?: number;
  extraction?: number;
  context?: number;
  generation?: number;
  streaming?: number;
  completion?: number;
  fullPipeline?: number;
}

/**
 * Main 6‑stage answer generation pipeline.
 * Target: ~4s end‑to‑end as per spec (100ms + 50ms + 150ms + ~1.5‑3s + completion). [file:1][file:3]
 */
export async function executeAnswerGeneration(
  opts: AnswerGenerationOptions
): Promise<void> {
  const startTime = Date.now();
  const latencies: PipelineStageLatency = {};

  // Stage 1 – Detection (100ms target) [file:1][file:3]
  const detectionStart = Date.now();
  const detected = await detectQuestion({
    transcript: opts.transcript,
    explicitQuestionText: opts.explicitQuestionText,
  });
  latencies.detection = Date.now() - detectionStart;
  if (!detected || !detected.questionText) {
    console.warn("[pipeline] No question detected – aborting generation");
    return;
  }

  // Stage 2 – Extraction (50ms target) [file:1][file:3]
  const extractionStart = Date.now();
  const extracted = normalizeQuestion(detected.questionText);
  latencies.extraction = Date.now() - extractionStart;

  // Stage 3 – Context Load (150ms target) [file:1][file:3]
  const contextStart = Date.now();
  const contextEnvelopePromise = buildContextEnvelope({
    userId: opts.userId,
    sessionId: opts.sessionId,
    questionText: extracted,
    questionTypeHint: opts.questionTypeHint,
  });
  const contextEnvelope = await contextEnvelopePromise;
  latencies.context = Date.now() - contextStart;

  // Stage 4 – AI Generation with streaming (1.5–3s first token) [file:1][file:3]
  const generationStart = Date.now();
  let fullAnswer = "";

  await routeAnswerGeneration({
    questionText: extracted,
    questionTypeHint: opts.questionTypeHint,
    modelHint: opts.modelHint,
    context: contextEnvelope,
    onToken: (token: string) => {
      fullAnswer += token;
      appendStreamChunk(token);
    },
    onDone: async () => {
      latencies.generation = Date.now() - generationStart;
      // Stage 5 / 6 handled below once stream finishes
      const completionStart = Date.now();

      // Stage 5 – Streaming Display (continuous)
      // Already happening via appendStreamChunk

      // Stage 6 – Completion (100ms target) [file:1][file:3]
      await commitStreamedAnswer({
        sessionId: opts.sessionId,
        questionText: extracted,
        finalText: fullAnswer,
        latencies,
      });

      latencies.completion = Date.now() - completionStart;
      latencies.fullPipeline = Date.now() - startTime;

      recordLatency("full-pipeline", latencies.fullPipeline);
    },
  });
}

/* ──────────────────────────────────────────────────────────────── */
/* Helpers & instrumentation                                      */
/* ──────────────────────────────────────────────────────────────── */

function normalizeQuestion(raw: string): string {
  const cleaned = raw.trim();
  if (!cleaned.endsWith("?")) return cleaned + "?";
  return cleaned;
}

function recordLatency(stage: string, ms?: number) {
  if (typeof ms !== "number") return;
  try {
    // Simple placeholder: can be wired to analytics / debug log.
    // In production you might call a metrics client here.
    const overlayStore = useOverlayStore.getState();
    overlayStore.logLatency?.(stage, ms);
  } catch (_err) {
    // non‑fatal
  }
}
