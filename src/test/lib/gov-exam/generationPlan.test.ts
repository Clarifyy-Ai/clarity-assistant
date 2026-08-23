import { describe, expect, it } from "vitest";

import {
  blockedPlanPayload,
  decideGenerationPlan,
  planSummary,
} from "../../../../supabase/functions/_shared/govGenerationPlan";

describe("decideGenerationPlan", () => {
  it("uses the bank alone when inventory covers the request", () => {
    const plan = decideGenerationPlan({
      requested: 20,
      available: 100,
      mode: "generated_mock",
      canUseAi: true,
    });

    expect(plan.kind).toBe("bank_only");
    expect(plan.skipAiFill).toBe(true);
    expect(plan.bankContribution).toBe(20);
    expect(plan.aiContribution).toBe(0);
  });

  it("generates the shortfall when the caller has the AI capability", () => {
    const plan = decideGenerationPlan({
      requested: 100,
      available: 21,
      mode: "generated_mock",
      canUseAi: true,
    });

    expect(plan.kind).toBe("ai_assisted");
    expect(plan.skipAiFill).toBe(false);
    expect(plan.bankContribution).toBe(21);
    expect(plan.aiContribution).toBe(79);
    expect(plan.paperClass).toBe("ai_generated");
  });

  it("generates a full paper for an exam with an empty bank", () => {
    const plan = decideGenerationPlan({
      requested: 100,
      available: 0,
      mode: "generated_mock",
      canUseAi: true,
    });

    expect(plan.kind).toBe("ai_assisted");
    expect(plan.aiContribution).toBe(100);
  });

  it("blocks with CAPABILITY_REQUIRED when AI is unavailable to the plan", () => {
    const plan = decideGenerationPlan({
      requested: 100,
      available: 21,
      mode: "generated_mock",
      canUseAi: false,
    });

    expect(plan.kind).toBe("blocked");
    expect(plan.reasonCode).toBe("CAPABILITY_REQUIRED");
    expect(plan.maxCustomSetSize).toBe(21);
  });

  it("never fabricates questions for an official previous paper", () => {
    const plan = decideGenerationPlan({
      requested: 100,
      available: 21,
      mode: "official_previous",
      canUseAi: true,
    });

    expect(plan.kind).toBe("blocked");
    expect(plan.reasonCode).toBe("QUESTION_INVENTORY_INSUFFICIENT");
    expect(plan.skipAiFill).toBe(true);
  });

  it("routes to the Python factory only when explicitly preferred", () => {
    const base = {
      requested: 100,
      available: 0,
      mode: "generated_mock",
      canUseAi: true,
    };

    expect(decideGenerationPlan(base).generator).toBe("edge_assembler");
    expect(
      decideGenerationPlan({ ...base, preferPythonFactory: true }).generator,
    ).toBe("python_paper_factory");
  });

  it("keeps bank-only work on the Edge assembler even when Python is preferred", () => {
    const plan = decideGenerationPlan({
      requested: 10,
      available: 50,
      mode: "generated_mock",
      canUseAi: true,
      preferPythonFactory: true,
    });

    expect(plan.generator).toBe("edge_assembler");
  });
});

describe("blockedPlanPayload", () => {
  it("explains the upgrade path without leaking internals", () => {
    const payload = blockedPlanPayload(
      decideGenerationPlan({
        requested: 100,
        available: 23,
        mode: "generated_mock",
        canUseAi: false,
      }),
    );

    expect(payload.code).toBe("CAPABILITY_REQUIRED");
    expect(payload.available).toBe(23);
    expect(payload.requested).toBe(100);
    expect(payload.maxCustomSetSize).toBe(23);
    expect(payload.aiFillAvailable).toBe(true);
    expect(payload.error).toContain("23 approved questions");
    expect(payload.error).toContain("77");
    expect(payload.error).not.toMatch(/402|503|postgres|sql/i);
  });

  it("reports a plain inventory shortage for official papers", () => {
    const payload = blockedPlanPayload(
      decideGenerationPlan({
        requested: 100,
        available: 23,
        mode: "official_previous",
        canUseAi: true,
      }),
    );

    expect(payload.code).toBe("QUESTION_INVENTORY_INSUFFICIENT");
    expect(payload.aiFillAvailable).toBe(false);
  });
});

describe("planSummary", () => {
  it("summarises the split the UI must disclose", () => {
    const summary = planSummary(
      decideGenerationPlan({
        requested: 100,
        available: 21,
        mode: "generated_mock",
        canUseAi: true,
      }),
    );

    expect(summary).toEqual({
      kind: "ai_assisted",
      generator: "edge_assembler",
      bankQuestions: 21,
      aiQuestions: 79,
      requested: 100,
      paperClass: "ai_generated",
    });
  });
});
