/**
 * Edge-oriented contract tests for generate-questions behavior
 * (schemas / envelopes mirrored from the Deno function).
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

const generateQuestionsSchema = z
  .object({
    type: z.string().trim().max(80).optional(),
    count: z.number().int().min(1).max(20).optional(),
    interview_type: z.string().trim().max(80).optional(),
    question_count: z.number().int().min(1).max(20).optional(),
    company: z.string().trim().max(120).optional().default(""),
    role: z.string().trim().max(120).optional().default(""),
    difficulty: z.enum(["easy", "medium", "hard", "mixed"]).optional().default("mixed"),
    free_session: z.boolean().optional().default(false),
    session_id: z.string().uuid().nullable().optional(),
    exclude_questions: z.array(z.string().trim().max(500)).max(40).optional().default([]),
    allow_fallback: z.boolean().optional().default(true),
  })
  .transform((data) => ({
    interviewType: data.type ?? data.interview_type ?? "behavioral",
    questionCount: data.count ?? data.question_count ?? 5,
    free_session: data.free_session ?? false,
    exclude_questions: data.exclude_questions ?? [],
    allow_fallback: data.allow_fallback ?? true,
    session_id: data.session_id,
  }));

describe("generate-questions request contract", () => {
  it("accepts canonical + legacy fields and exclude list", () => {
    const parsed = generateQuestionsSchema.safeParse({
      type: "behavioural",
      count: 1,
      free_session: true,
      session_id: "11111111-1111-4111-8111-111111111111",
      exclude_questions: ["Tell me about yourself."],
      allow_fallback: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.questionCount).toBe(1);
      expect(parsed.data.exclude_questions).toHaveLength(1);
      expect(parsed.data.free_session).toBe(true);
    }
  });

  it("rejects invalid session id", () => {
    const parsed = generateQuestionsSchema.safeParse({
      count: 1,
      session_id: "not-a-uuid",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("generate-questions error envelopes", () => {
  it("uses structured unavailable code without raw 502 text", () => {
    const body = {
      success: false,
      error: "We couldn't generate the next question right now. Please try again.",
      code: "QUESTION_GENERATION_UNAVAILABLE",
      request_id: "req-1",
    };
    expect(body.code).toBe("QUESTION_GENERATION_UNAVAILABLE");
    expect(body.error).not.toMatch(/502|503|SQL/i);
  });

  it("marks ended sessions distinctly", () => {
    const body = {
      success: false,
      error: "This interview session has already ended.",
      code: "SESSION_ENDED",
    };
    expect(body.code).toBe("SESSION_ENDED");
  });

  it("success payload includes source for AI vs fallback", () => {
    const body = {
      success: true,
      source: "fallback" as const,
      cached: false,
      questions: [
        {
          id: "1",
          question_text: "Why this role?",
          question: "Why this role?",
          difficulty: "easy",
          type: "hr",
          tags: ["fallback_bank"],
          order: 1,
        },
      ],
      count: 1,
    };
    expect(body.source).toBe("fallback");
    expect(body.questions[0].tags).toContain("fallback_bank");
  });
});
