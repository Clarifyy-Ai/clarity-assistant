import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { ApiClientError } from "@/lib/api/apiClient";
import {
  validateGeneratedQuestion,
  validateGeneratedQuestionsPayload,
} from "@/lib/mock/validateGeneratedQuestion";
import { selectFallbackQuestion } from "@/lib/mock/selectFallbackQuestion";
import type { SessionQuestion } from "@/types/session.types";

export const QUESTION_GENERATION_USER_ERROR =
  "We couldn't generate the next question right now. Please try again.";

export type MockGenerateQuestionsRequest = {
  type: string;
  count: number;
  difficulty?: "easy" | "medium" | "hard" | "mixed";
  company?: string;
  role?: string;
  session_id: string;
  resume_context?: string;
  job_description?: string;
  free_session?: boolean;
  exclude_questions?: string[];
  allow_fallback?: boolean;
};

export type MockQuestionSource =
  | "approved_bank"
  | "ai_generated_practice"
  | "generated_practice_python"
  | "fallback_bank";

export type MockGenerateQuestionsResult = {
  question: SessionQuestion;
  source: "ai" | "fallback" | "python";
  questionSource: MockQuestionSource;
  operationId: string;
  cached?: boolean;
};

function mapEdgeSourceToQuestionSource(
  edgeSource: string | undefined,
  fromClientBank: boolean,
): MockQuestionSource {
  if (fromClientBank) return "fallback_bank";
  switch (edgeSource) {
    case "fallback":
    case "database":
      return "approved_bank";
    case "python":
      return "generated_practice_python";
    case "ai":
    default:
      return "ai_generated_practice";
  }
}

function tagQuestionWithSource(
  question: SessionQuestion,
  questionSource: MockQuestionSource,
): SessionQuestion {
  const tags = Array.from(new Set([...(question.tags ?? []), questionSource]));
  return { ...question, tags };
}

function mapUserFacingGenerationError(err: unknown): string {
  if (err instanceof ApiClientError) {
    const code = err.code;
    if (
      code === "QUESTION_GENERATION_UNAVAILABLE" ||
      code === "QUESTION_GENERATION_FAILED" ||
      code === "AI_UNAVAILABLE" ||
      code === "PROVIDER_UNAVAILABLE" ||
      err.status === 502 ||
      err.status === 503
    ) {
      return QUESTION_GENERATION_USER_ERROR;
    }
    if (code === "SESSION_ENDED" || code === "SESSION_NOT_ACTIVE") {
      return "This interview session has already ended.";
    }
    if (code === "FORBIDDEN" || err.status === 403) {
      return "You don't have access to this session.";
    }
    // Prefer structured message when safe (no stack / SQL).
    if (err.message && !/\b(502|503|SQL|stack|supabase)\b/i.test(err.message)) {
      return err.message;
    }
  }
  return QUESTION_GENERATION_USER_ERROR;
}

/** Stable per-session question op id — no random UUID (idempotent refresh / retry). */
export function createMockQuestionOperationId(sessionId: string, index: number): string {
  return `gq:${sessionId}:q${index}`;
}

/**
 * Generate exactly one validated question for a mock session.
 * Uses idempotency key; prefers AI; may return labeled local-bank fallback.
 */
export async function generateMockInterviewQuestion(
  input: MockGenerateQuestionsRequest & {
    questionNumber: number;
    usedTexts: string[];
    signal?: AbortSignal;
    idempotencyKey: string;
    /** Skip provider and use approved local bank only. */
    forceFallback?: boolean;
  },
): Promise<MockGenerateQuestionsResult> {
  const {
    questionNumber,
    usedTexts,
    signal,
    idempotencyKey,
    allow_fallback = true,
    forceFallback = false,
    ...body
  } = input;

  if (forceFallback) {
    const fallback = selectFallbackQuestion({
      type: body.type,
      count: 1,
      company: body.company,
      role: body.role,
      difficulty: body.difficulty,
      excludeTexts: usedTexts,
    });
    if (!fallback) {
      throw new ApiClientError({
        message: QUESTION_GENERATION_USER_ERROR,
        status: 503,
        code: "QUESTION_GENERATION_UNAVAILABLE",
      });
    }
    const validated = validateGeneratedQuestion(fallback, {
      sessionId: body.session_id,
      questionNumber,
      usedTexts,
    });
    if (!validated.ok) {
      throw new ApiClientError({
        message: QUESTION_GENERATION_USER_ERROR,
        status: 503,
        code: "QUESTION_GENERATION_UNAVAILABLE",
      });
    }
    return {
      question: tagQuestionWithSource(validated.question, "fallback_bank"),
      source: "fallback",
      questionSource: "fallback_bank",
      operationId: idempotencyKey,
    };
  }

  try {
    const data = await fetchEdgeJson<{
      questions?: unknown[];
      data?: { questions?: unknown[] };
      source?: "ai" | "fallback" | "python" | "database";
      cached?: boolean;
      success?: boolean;
      code?: string;
    }>(
      "generate-questions",
      {
        type: body.type,
        count: Math.max(1, body.count),
        interview_type: body.type,
        question_count: Math.max(1, body.count),
        difficulty: body.difficulty ?? "medium",
        company: body.company ?? "",
        role: body.role ?? "",
        session_id: body.session_id,
        resume_context: body.resume_context ?? "",
        job_description: body.job_description ?? "",
        free_session: body.free_session ?? true,
        exclude_questions: body.exclude_questions ?? usedTexts,
        allow_fallback,
      },
      {
        signal,
        timeoutMs: 45_000,
        headers: {
          "Idempotency-Key": idempotencyKey,
          "x-idempotency-key": idempotencyKey,
        },
      },
    );

    const parsed = validateGeneratedQuestionsPayload(data);
    if (!parsed.ok || parsed.questions.length === 0) {
      throw new ApiClientError({
        message: QUESTION_GENERATION_USER_ERROR,
        status: 502,
        code: "QUESTION_GENERATION_UNAVAILABLE",
      });
    }

    // Prefer first unused valid question from payload.
    for (const raw of parsed.questions) {
      const validated = validateGeneratedQuestion(raw, {
        sessionId: body.session_id,
        questionNumber,
        usedTexts,
      });
      if (validated.ok) {
        const edgeSource = data.source ?? "ai";
        const mappedSource =
          edgeSource === "fallback" || edgeSource === "database"
            ? "fallback"
            : edgeSource === "python"
              ? "python"
              : "ai";
        const questionSource = mapEdgeSourceToQuestionSource(edgeSource, false);
        return {
          question: tagQuestionWithSource(validated.question, questionSource),
          source: mappedSource,
          questionSource,
          operationId: idempotencyKey,
          cached: Boolean(data.cached),
        };
      }
    }

    throw new ApiClientError({
      message: QUESTION_GENERATION_USER_ERROR,
      status: 502,
      code: "QUESTION_GENERATION_UNAVAILABLE",
    });
  } catch (err) {
    if (signal?.aborted) throw err;

    if (allow_fallback) {
      const fallback = selectFallbackQuestion({
        type: body.type,
        count: 1,
        company: body.company,
        role: body.role,
        difficulty: body.difficulty,
        excludeTexts: usedTexts,
      });
      if (fallback) {
        const validated = validateGeneratedQuestion(fallback, {
          sessionId: body.session_id,
          questionNumber,
          usedTexts,
        });
        if (validated.ok) {
          return {
            question: tagQuestionWithSource(validated.question, "fallback_bank"),
            source: "fallback",
            questionSource: "fallback_bank",
            operationId: idempotencyKey,
          };
        }
      }
    }

    throw new ApiClientError({
      message: mapUserFacingGenerationError(err),
      status: err instanceof ApiClientError ? err.status : 503,
      code:
        err instanceof ApiClientError
          ? err.code
          : "QUESTION_GENERATION_UNAVAILABLE",
    });
  }
}

export { mapUserFacingGenerationError };
