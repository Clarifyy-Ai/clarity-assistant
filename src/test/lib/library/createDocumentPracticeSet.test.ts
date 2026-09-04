import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/apiClient";

const generateQuestions = vi.fn();
const practiceSelectResult = vi.fn();
const answerInsertResult = vi.fn();
const practiceInsertResult = vi.fn();
const practiceUpdateResult = vi.fn();

vi.mock("@/lib/api/ai", () => ({
  generateQuestions: (...args: unknown[]) => generateQuestions(...args),
}));

function chain(terminal: () => Promise<{ data: unknown; error: unknown }>) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  for (const key of ["select", "insert", "update", "eq", "order", "limit"]) {
    api[key] = vi.fn(() => self());
  }
  api.maybeSingle = vi.fn(() => terminal());
  api.single = vi.fn(() => terminal());
  // insert().select() resolves as a thenable-like via select returning chain that ends at await
  api.then = undefined;
  return api;
}

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "document_practice_sets") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () => practiceSelectResult(),
                  }),
                }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () => practiceInsertResult(),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => practiceUpdateResult(),
            }),
          }),
        };
      }
      if (table === "answer_bank") {
        return {
          insert: () => ({
            select: () => answerInsertResult(),
          }),
        };
      }
      return chain(async () => ({ data: null, error: null }));
    },
  },
}));

import {
  createDocumentPracticeSet,
  practiceSetIdempotencyKey,
} from "@/lib/library/createDocumentPracticeSet";

const baseInput = {
  userId: "user-1",
  documentId: "doc-1",
  documentName: "resume.pdf",
  contentRights: "USER_OWNED" as const,
  rightsConfirmed: true,
  processingStatus: "completed",
  parsedContent: "Built APIs at Acme. Led a migration that cut latency 40%.",
  contentHash: "abc123",
};

describe("createDocumentPracticeSet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    practiceSelectResult.mockResolvedValue({ data: null, error: null });
    answerInsertResult.mockResolvedValue({
      data: [{ id: "q1" }, { id: "q2" }],
      error: null,
    });
    practiceInsertResult.mockResolvedValue({ data: { id: "ps-1" }, error: null });
    practiceUpdateResult.mockResolvedValue({ data: null, error: null });
    generateQuestions.mockResolvedValue({
      success: true,
      request_id: "r1",
      questions: [
        { question_text: "Tell me about your API work", question: "Tell me about your API work", difficulty: "medium", type: "Resume Based", tags: [], order: 1 },
        { question_text: "How did you reduce latency?", question: "How did you reduce latency?", difficulty: "hard", type: "Resume Based", tags: ["perf"], order: 2 },
      ],
      count: 2,
    });
  });

  it("rejects when parse is incomplete", async () => {
    await expect(
      createDocumentPracticeSet({
        ...baseInput,
        processingStatus: "extracting",
      }),
    ).rejects.toThrow(/parsing completes/i);
    expect(generateQuestions).not.toHaveBeenCalled();
  });

  it("reuses an existing filled practice set without regenerating", async () => {
    practiceSelectResult.mockResolvedValue({
      data: { id: "ps-existing", question_ids: ["a", "b", "c"] },
      error: null,
    });
    const result = await createDocumentPracticeSet(baseInput);
    expect(result).toEqual({
      practiceSetId: "ps-existing",
      questionIds: ["a", "b", "c"],
      reused: true,
    });
    expect(generateQuestions).not.toHaveBeenCalled();
  });

  it("generates questions from parsed content with stable idempotency key", async () => {
    const result = await createDocumentPracticeSet(baseInput);
    expect(result.practiceSetId).toBe("ps-1");
    expect(result.questionIds).toEqual(["q1", "q2"]);
    expect(result.reused).toBe(false);
    expect(generateQuestions).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "Resume Based",
        resume_context: expect.stringContaining("Built APIs"),
      }),
      {
        idempotencyKey: practiceSetIdempotencyKey({
          userId: "user-1",
          documentId: "doc-1",
          contentHash: "abc123",
        }),
      },
    );
  });

  it("surfaces insufficient credits without fake success", async () => {
    generateQuestions.mockRejectedValue(
      new ApiClientError({
        message: "Need credits",
        status: 402,
        code: "INSUFFICIENT_CREDITS",
      }),
    );
    await expect(createDocumentPracticeSet(baseInput)).rejects.toThrow(/not enough credits/i);
  });

  it("fills an empty stub practice set instead of inserting a duplicate", async () => {
    practiceSelectResult.mockResolvedValue({
      data: { id: "ps-stub", question_ids: [] },
      error: null,
    });
    const result = await createDocumentPracticeSet(baseInput);
    expect(result.practiceSetId).toBe("ps-stub");
    expect(result.questionIds).toEqual(["q1", "q2"]);
    expect(practiceInsertResult).not.toHaveBeenCalled();
    expect(practiceUpdateResult).toHaveBeenCalled();
  });
});

describe("DocumentLibrary soft-wait contract", () => {
  it("enqueues durable jobs without treating soft wait as terminal failure", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/pages/app/library/DocumentLibrary.tsx", "utf8");
    expect(source).toContain("isClientWaitElapsed");
    expect(source).toContain("pollDocumentJobUntilDone");
    expect(source).toMatch(/processing_error:\s*null/);
    expect(source).not.toMatch(/error_code === ["']PARSER_TIMEOUT["']/);
    expect(source).toContain("createDocumentPracticeSet");
    expect(source).toContain("canCreatePracticeSetFromParsedDoc");
  });
});
