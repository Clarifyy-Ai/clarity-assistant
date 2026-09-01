// src/lib/ai/anthropicClient.ts — PRODUCTION READY
import { fetchEdge, fetchEdgeJson, getAuthHeaders } from "@/lib/network/fetchEdge";
import { createIdempotencyKey } from "@/lib/api/functions";
import { consumeSSEStream } from "@/lib/ai/geminiClient";
import { ApiClientError } from "@/lib/api/apiClient";
import type { CoachingContext } from "@/types/ai.types";

export interface ClaudeStreamOptions {
  question: string;
  context: CoachingContext;
  model?: string;
  isLive: boolean;
  sessionId: string;
  questionId: string;
  /** Sessionless AI mode when sessionId is absent. */
  mode?: string;
  simpleLanguage?: boolean;
  callType?: "interview" | "regular_call";
  language?: string;
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}

// Stream Claude “hint” — currently proxies to generate-hint EF.
export async function streamClaudeHint(opts: ClaudeStreamOptions): Promise<void> {
  const { question, context, simpleLanguage, onChunk, onDone, onError, signal } = opts;

  const sessionId =
    typeof opts.sessionId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      opts.sessionId,
    )
      ? opts.sessionId
      : null;
  const mode =
    opts.mode ??
    (sessionId ? undefined : opts.isLive ? "rehearsal" : "practice");

  const body = {
    question,
    model: opts.model ?? "claude-3-5-sonnet-20241022",
    interview_type: context.session_type ?? "behavioral",
    target_company: context.target_company ?? "",
    transcript: context.last_transcript ?? "",
    resume_context: context.resume_experience_summary ?? "",
    simple_language: simpleLanguage ?? false,
    session_id: sessionId,
    ...(mode ? { mode } : {}),
  };

  try {
    const idempotencyKey =
      typeof opts.questionId === "string" && opts.questionId.length > 0
        ? opts.questionId
        : createIdempotencyKey("generate-hint");
    const headers = await getAuthHeaders({
      Accept: "text/event-stream",
      "Idempotency-Key": idempotencyKey,
      "x-idempotency-key": idempotencyKey,
    });
    const response = await fetchEdge("generate-hint", body, {
      method: "POST",
      headers,
      signal,
      timeoutMs: 60_000,
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => `HTTP ${response.status}`);
      let parsed: { error?: string; code?: string } | null = null;
      try {
        parsed = JSON.parse(errText) as { error?: string; code?: string };
      } catch {
        parsed = null;
      }
      throw new ApiClientError({
        message: parsed?.error || `Hint generation failed (${response.status}).`,
        status: response.status,
        code: parsed?.code ?? "",
      });
    }
    if (!response.body) {
      throw new ApiClientError({
        message: "Hint stream returned an empty body.",
        status: 502,
        code: "EMPTY_STREAM",
      });
    }
    await consumeSSEStream(response.body, onChunk, onDone, onError, signal);
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// Non‑streaming Claude call → prep-tool EF.
export async function callClaude(payload: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
  max_tokens?: number;
  session_id?: string;
}): Promise<string> {
  const userMessage = payload.messages.find((m) => m.role === "user")?.content ?? "";
  const combinedPrompt = payload.system ? `${payload.system}\n\n${userMessage}` : userMessage;

  const data = await fetchEdgeJson<{ result?: string }>("prep-tool", {
    tool_id: "raw_prompt",
    input: combinedPrompt,
    model: payload.model,
    max_tokens: payload.max_tokens,
    session_id: payload.session_id,
  }, {
    headers: {
      "Idempotency-Key": createIdempotencyKey("prep-tool"),
    },
  });

  return data.result ?? "";
}

// System design helper — still proxied via prep-tool.
export async function generateSystemDesignGuide(payload: {
  scenario: string;
  scale: "small" | "medium" | "large" | "massive";
  constraints: string[];
  context: Pick<CoachingContext, "role" | "experience_level" | "target_company">;
}): Promise<string> {
  const { scenario, scale, constraints, context } = payload;

  const question = `Design a ${scenario}.
Scale: ${scale} (${getScaleDescription(scale)})
${constraints.length > 0 ? `Constraints: ${constraints.join(", ")}` : ""}

Provide:
1. Core components and their responsibilities
2. Database recommendation with reasoning
3. Scaling considerations
4. Key trade-offs table (Option A vs Option B)
5. What interviewers are really testing here`;

  return callClaude({
    system: `You are a senior systems architect and technical interviewer coach.
Candidate: ${context.role ?? "Engineer"}, ${context.experience_level}-level
${context.target_company ? `Target company: ${context.target_company}` : ""}`,
    messages: [{ role: "user", content: question }],
    max_tokens: 1200,
  });
}

function getScaleDescription(scale: string): string {
  const map: Record<string, string> = {
    small: "thousands of users, single region",
    medium: "millions of users, multi-region",
    large: "tens of millions of users, global",
    massive: "hundreds of millions of users, hyper-scale",
  };
  return map[scale] ?? "medium scale";
}
