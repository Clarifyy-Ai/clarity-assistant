import { buildSystemPrompt } from "./contextEnvelopeBuilder";
import { consumeSSEStream } from "./geminiClient";
import { retry } from "@/lib/utils";
import type { CoachingContext } from "@/types/ai.types";

// ─────────────────────────────────────────────────────────────────
// Anthropic Claude Client — proxied via Supabase Edge Function
// Best for: system design, architecture, leadership, complex reasoning
// ─────────────────────────────────────────────────────────────────

const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export interface ClaudeStreamOptions {
  question: string;
  context: CoachingContext;
  isLive: boolean;
  sessionId: string;
  questionId: string;
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}

// ─────────────────────────────────────────────────────────────────
// Stream Claude hint
// ─────────────────────────────────────────────────────────────────

export async function streamClaudeHint(opts: ClaudeStreamOptions): Promise<void> {
  const {
    question, context, isLive,
    sessionId, questionId,
    onChunk, onDone, onError, signal,
  } = opts;

  const systemPrompt = buildSystemPrompt(context, isLive);

  const body = JSON.stringify({
    model:       "claude-3-5-sonnet-20241022",
    system:      systemPrompt,
    messages: [
      { role: "user", content: question },
    ],
    stream:      true,
    max_tokens:  600,
    session_id:  sessionId,
    question_id: questionId,
  });

  try {
    const response = await retry(
      () =>
        fetch(`${EDGE_BASE}/ai-hint-claude`, {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body,
          signal,
        }),
      2,
      400
    );

    if (!response.ok) {
      throw new Error(`Claude hint failed: ${response.status}`);
    }

    if (!response.body) throw new Error("Claude response has no body");

    await consumeSSEStream(response.body, onChunk, onDone, onError);
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// ─────────────────────────────────────────────────────────────────
// Non-streaming Claude call
// ─────────────────────────────────────────────────────────────────

export async function callClaude(payload: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
  max_tokens?: number;
  session_id?: string;
}): Promise<string> {
  const response = await fetch(`${EDGE_BASE}/ai-claude`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      model:      payload.model ?? "claude-3-5-sonnet-20241022",
      system:     payload.system,
      messages:   payload.messages,
      max_tokens: payload.max_tokens ?? 800,
      stream:     false,
      session_id: payload.session_id,
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude call failed: ${response.status}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text ?? "";
}

// ─────────────────────────────────────────────────────────────────
// System Design specialised prompt
// ─────────────────────────────────────────────────────────────────

export async function generateSystemDesignGuide(payload: {
  scenario: string;
  scale: "small" | "medium" | "large" | "massive";
  constraints: string[];
  context: Pick<CoachingContext, "role" | "experience_level" | "target_company">;
}): Promise<string> {
  const { scenario, scale, constraints, context } = payload;

  const system = `You are a senior systems architect and technical interviewer coach.
Generate comprehensive system design interview guidance.
Candidate: ${context.role ?? "Engineer"}, ${context.experience_level}-level
${context.target_company ? `Target company: ${context.target_company}` : ""}

Return structured guidance covering: components, database choices, scaling strategy, trade-offs.
Be specific with technology choices. Explain the WHY behind each decision.`;

  const userMessage = `Design a ${scenario}.
Scale: ${scale} (${getScaleDescription(scale)})
${constraints.length > 0 ? `Constraints: ${constraints.join(", ")}` : ""}

Provide:
1. Core components and their responsibilities
2. Database recommendation with reasoning
3. Scaling considerations
4. Key trade-offs table (Option A vs Option B)
5. What interviewers are really testing here`;

  return callClaude({
    system,
    messages: [{ role: "user", content: userMessage }],
    max_tokens: 1200,
  });
}

function getScaleDescription(scale: string): string {
  const map: Record<string, string> = {
    small:   "thousands of users, single region",
    medium:  "millions of users, multi-region",
    large:   "tens of millions of users, global",
    massive: "hundreds of millions of users, hyper-scale",
  };
  return map[scale] ?? "medium scale";
}
