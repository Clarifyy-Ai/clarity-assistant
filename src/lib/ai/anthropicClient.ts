import { EDGE_BASE } from "@/lib/env";
import { retry } from "@/lib/utils";
import type { CoachingContext } from "@/types/ai.types";

export interface ClaudeStreamOptions {
  question: string;
  context: CoachingContext;
  isLive: boolean;
  sessionId: string;
  questionId: string;
  simpleLanguage?: boolean;
  callType?: "interview" | "regular_call";
  language?: string;
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}

// Stream Claude “hint” — currently proxies to generate-hint EF. [file:1]
export async function streamClaudeHint(
  opts: ClaudeStreamOptions
): Promise<void> {
  const {
    question,
    context,
    simpleLanguage,
    onChunk,
    onDone,
    onError,
    signal,
  } = opts;

  const body = JSON.stringify({
    user_id:         context.user_id ?? "",
    question,
    interview_type:  context.session_type ?? "behavioural",
    target_company:  context.target_company ?? null,
    transcript:      null,
    resume_text:     context.resume_experience_summary ?? null,
    simple_language: simpleLanguage ?? false,
  });

  try {
    const response = await retry(
      () =>
        import("@/lib/network/fetchEdge").then(async ({ getAuthHeaders }) => {
          const authHeaders = await getAuthHeaders();
          return fetch(`${EDGE_BASE}/generate-hint`, {
            method: "POST",
            headers: authHeaders,
            body,
            signal,
          });
        }),
      2,
      400
    );

    if (!response.ok) {
      throw new Error(`Hint failed: ${response.status}`);
    }

    const data = await response.json();
    const hint: string = data.hint ?? "";
    if (hint) onChunk(hint);
    onDone(hint);
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// Non‑streaming Claude call → prep-tool EF. [file:1]
export async function callClaude(payload: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
  max_tokens?: number;
  session_id?: string;
}): Promise<string> {
  const userMessage =
    payload.messages.find((m) => m.role === "user")?.content ?? "";
  const combinedPrompt = payload.system
    ? `${payload.system}\n\n${userMessage}`
    : userMessage;

  const { getAuthHeaders } = await import("@/lib/network/fetchEdge");
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${EDGE_BASE}/prep-tool`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ tool_id: "raw_prompt", input: combinedPrompt }),
  });

  if (!response.ok) {
    throw new Error(`AI call failed: ${response.status}`);
  }

  const data = await response.json();
  return data.result ?? "";
}

// System design helper — still proxied via prep-tool. [file:1]
export async function generateSystemDesignGuide(payload: {
  scenario: string;
  scale: "small" | "medium" | "large" | "massive";
  constraints: string[];
  context: Pick<
    CoachingContext,
    "role" | "experience_level" | "target_company"
  >;
}): Promise<string> {
  const { scenario, scale, constraints, context } = payload;

  const question = `Design a ${scenario}.
Scale: ${scale} (${getScaleDescription(scale)})
${
  constraints.length > 0 ? `Constraints: ${constraints.join(", ")}` : ""
}

Provide:
1. Core components and their responsibilities
2. Database recommendation with reasoning
3. Scaling considerations
4. Key trade-offs table (Option A vs Option B)
5. What interviewers are really testing here`;

  return callClaude({
    system: `You are a senior systems architect and technical interviewer coach.
Candidate: ${context.role ?? "Engineer"}, ${
      context.experience_level
    }-level
${context.target_company ? `Target company: ${context.target_company}` : ""}`,
    messages: [{ role: "user", content: question }],
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
