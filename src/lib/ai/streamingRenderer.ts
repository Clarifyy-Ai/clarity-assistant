// src/lib/ai/streamingRenderer.ts

import { useOverlayStore } from "@/store/overlayStore";
import type { PipelineStageLatency } from "./answerGenerationPipeline";

export interface CommitStreamedAnswerInput {
  sessionId: string;
  questionText: string;
  finalText: string;
  latencies?: PipelineStageLatency;
}

/**
 * Stage 5 – Real‑time streaming display.
 * Called once per token / small chunk from the model router. [file:1][file:3]
 */
export function appendStreamChunk(chunk: string): void {
  const overlayStore = useOverlayStore.getState();

  // Expect overlayStore to expose something like appendStreamChunk.
  // If not yet present, you can adapt to your actual store API.
  if (typeof overlayStore.appendStreamChunk === "function") {
    overlayStore.appendStreamChunk(chunk);
  } else {
    // Fallback: basic concatenation into a 'streamingBuffer' string.
    const prev = overlayStore.streamingBuffer ?? "";
    overlayStore.setStreamingBuffer?.(prev + chunk);
  }
}

/**
 * Stage 6 – Completion.
 * Commits the final answer, logs latencies, and persists the result
 * into the session log as needed. [file:1][file:3]
 */
export async function commitStreamedAnswer(
  input: CommitStreamedAnswerInput
): Promise<void> {
  const { sessionId, questionText, finalText, latencies } = input;
  const overlayStore = useOverlayStore.getState();

  // 1) Commit final text into overlay UI state
  if (typeof overlayStore.commitStreamedAnswer === "function") {
    overlayStore.commitStreamedAnswer({
      sessionId,
      questionText,
      answerText: finalText,
      latencies,
    });
  } else {
    // Minimal fallback behavior
    overlayStore.setCurrentAnswer?.(finalText);
  }

  // 2) Log into session history / analytics
  try {
    if (typeof overlayStore.logAnswer === "function") {
      await overlayStore.logAnswer({
        sessionId,
        questionText,
        answerText: finalText,
        latencies,
      });
    }
  } catch (err) {
    console.error("[streamingRenderer] logAnswer failed:", err);
  }
}
