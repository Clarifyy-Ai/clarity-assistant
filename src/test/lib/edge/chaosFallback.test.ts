import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { httpStatusForDomainCode } from "../../../../supabase/functions/_shared/domainErrors";
import {
  applyChaosFlags,
  simulateHybridExecution,
  type RouteFallbackFlags,
} from "./hybridEnqueueFallbacks";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readShared(name: string): string {
  return fs.readFileSync(path.join(root, "supabase/functions/_shared", name), "utf8");
}

/** MATRIX route snapshots for Wave 2 chaos targets. */
const ROUTES = {
  practice_coach_help: {
    preferredOrder: ["ai"],
    pythonFallbackOnAiFailure: false,
    aiFallbackOnPythonFailure: false,
    canCompleteDeterministically: false,
    canCompleteWithDatabase: false,
    canUseAI: true,
    canUsePython: true,
  },
  star_builder: {
    preferredOrder: ["python", "ai", "deterministic"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: false,
    canCompleteDeterministically: true,
    canCompleteWithDatabase: false,
    canUseAI: true,
    canUsePython: true,
  },
  gap_analysis: {
    preferredOrder: ["deterministic", "python", "ai"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: false,
    canCompleteDeterministically: true,
    canCompleteWithDatabase: true,
    canUseAI: true,
    canUsePython: true,
  },
  gov_exam_assemble: {
    preferredOrder: ["database", "python", "ai"],
    pythonFallbackOnAiFailure: true,
    aiFallbackOnPythonFailure: true,
    canCompleteDeterministically: false,
    canCompleteWithDatabase: true,
    canUseAI: true,
    canUsePython: true,
  },
  document_process: {
    preferredOrder: ["python", "ai"],
    pythonFallbackOnAiFailure: false,
    aiFallbackOnPythonFailure: true,
    canCompleteDeterministically: false,
    canCompleteWithDatabase: false,
    canUseAI: true,
    canUsePython: true,
  },
} satisfies Record<string, RouteFallbackFlags>;

const HYBRID_DOMAIN_CODES = [
  "AI_PROVIDER_UNAVAILABLE",
  "AI_TIMEOUT",
  "AI_INVALID_OUTPUT",
  "PYTHON_SERVICE_UNAVAILABLE",
  "PYTHON_PROCESSING_FAILED",
  "DATABASE_FAILURE",
] as const;

function assertNoRawGateway(status: number, code: string): void {
  expect(status).not.toBe(502);
  if (HYBRID_DOMAIN_CODES.includes(code as (typeof HYBRID_DOMAIN_CODES)[number])) {
    expect(status).not.toBe(500);
  }
}

describe("chaos flags — source contracts", () => {
  const router = readShared("operationRouter.ts");
  const python = readShared("pythonClient.ts");
  const hybrid = readShared("hybridExecute.ts");
  const hybridResp = readShared("hybridResponse.ts");

  it("documents HYBRID_FORCE_AI_UNAVAILABLE and HYBRID_FORCE_PYTHON_UNAVAILABLE", () => {
    expect(router).toContain("HYBRID_FORCE_AI_UNAVAILABLE");
    expect(router).toContain("HYBRID_FORCE_PYTHON_UNAVAILABLE");
    expect(python).toContain("HYBRID_FORCE_PYTHON_UNAVAILABLE");
    expect(hybrid).toContain("HYBRID_FORCE_PYTHON_UNAVAILABLE");
    expect(hybrid).toContain("HYBRID_FORCE_AI_UNAVAILABLE");
  });

  it("force flags block canUseAI / canUsePython without treating skip as runtime failure", () => {
    expect(router).toMatch(/canUseAI\s*=\s*!aiBlocked/);
    expect(router).toMatch(/canUsePython\s*=\s*!pythonBlocked/);
    expect(hybrid).toContain('outcome.kind === "skip"');
    expect(python).toContain("HYBRID_FORCE_PYTHON_UNAVAILABLE");
    expect(python).toMatch(/errorCode:\s*"PYTHON_SERVICE_UNAVAILABLE"/);
  });

  for (const op of Object.keys(ROUTES) as (keyof typeof ROUTES)[]) {
    it(`MATRIX defines ${op} with documented fallback chain`, () => {
      const r = ROUTES[op];
      expect(router).toContain(`${op}:`);
      for (const src of r.preferredOrder) {
        expect(router).toContain(`"${src}"`);
      }
    });
  }

  it("hybridFailure derives HTTP status from domain codes (never hardcodes 502)", () => {
    expect(hybridResp).toContain("httpStatusForDomainCode(code)");
    expect(hybridResp).not.toMatch(/status:\s*502/);
    expect(hybrid).toMatch(/hybridFailure\(\{[\s\S]*code:\s*lastFailCode/);
  });
});

describe("domain envelopes — hybrid failure paths", () => {
  it("maps chaos-relevant domain codes away from raw 500/502", () => {
    for (const code of HYBRID_DOMAIN_CODES) {
      const status = httpStatusForDomainCode(code);
      assertNoRawGateway(status, code);
    }
    expect(httpStatusForDomainCode("AI_PROVIDER_UNAVAILABLE")).toBe(503);
    expect(httpStatusForDomainCode("PYTHON_SERVICE_UNAVAILABLE")).toBe(503);
    expect(httpStatusForDomainCode("AI_INVALID_OUTPUT")).toBe(422);
  });
});

describe("HYBRID_FORCE_AI_UNAVAILABLE — skip AI, single charge + fallback", () => {
  it("practice_coach_help: AI skipped → fail closed (no python scaffold)", async () => {
    const route = applyChaosFlags(ROUTES.practice_coach_help, {
      forceAiUnavailable: true,
    });
    const result = await simulateHybridExecution({
      route,
      creditCost: 2,
      runners: {
        ai: async () => {
          throw new Error("must not run");
        },
        python: async () => ({ reply: "coach hint", hints: ["STAR"] }),
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(1);
    }
  });

  it("star_builder: AI skipped → python stages then deterministic polish path", async () => {
    const route = applyChaosFlags(ROUTES.star_builder, { forceAiUnavailable: true });
    let draft: { situation: string } | null = null;
    const result = await simulateHybridExecution({
      route,
      creditCost: 3,
      runners: {
        python: async () => {
          draft = { situation: "draft-only" };
          return null;
        },
        ai: async () => {
          throw new Error("must not run");
        },
        deterministic: async () => draft,
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("deterministic");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });

  it("gap_analysis: AI skipped → deterministic then python", async () => {
    const route = applyChaosFlags(ROUTES.gap_analysis, { forceAiUnavailable: true });
    const result = await simulateHybridExecution({
      route,
      creditCost: 4,
      runners: {
        deterministic: async () => null,
        python: async () => ({ gaps: ["communication"], score: 72 }),
        ai: async () => {
          throw new Error("must not run");
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("python");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });

  it("gov_exam_assemble: AI skipped → database bank hit without re-deduct", async () => {
    const route = applyChaosFlags(ROUTES.gov_exam_assemble, {
      forceAiUnavailable: true,
    });
    const result = await simulateHybridExecution({
      route,
      creditCost: 10,
      runners: {
        database: async () => ({ paper_id: "bank-1", questions: [{ id: "q1" }] }),
        python: async () => null,
        ai: async () => {
          throw new Error("must not run");
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("database");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });

  it("document_process: AI skipped → python extract succeeds once", async () => {
    const route = applyChaosFlags(ROUTES.document_process, {
      forceAiUnavailable: true,
    });
    const result = await simulateHybridExecution({
      route,
      creditCost: 5,
      runners: {
        python: async () => ({ text: "extracted", pages: 3 }),
        ai: async () => {
          throw new Error("must not run");
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("python");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });
});

describe("HYBRID_FORCE_PYTHON_UNAVAILABLE — skip python, single charge + fallback", () => {
  it("practice_coach_help: AI fail with python blocked → fail closed (no deterministic)", async () => {
    const route = applyChaosFlags(ROUTES.practice_coach_help, {
      forcePythonUnavailable: true,
    });
    const result = await simulateHybridExecution({
      route,
      creditCost: 2,
      runners: {
        ai: async () => {
          throw new Error("AI down");
        },
        python: async () => {
          throw new Error("must not run");
        },
        deterministic: async () => ({ reply: "template hint" }),
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(1);
    }
  });

  it("star_builder: python skipped → AI polish succeeds", async () => {
    const route = applyChaosFlags(ROUTES.star_builder, {
      forcePythonUnavailable: true,
    });
    const result = await simulateHybridExecution({
      route,
      creditCost: 3,
      runners: {
        python: async () => {
          throw new Error("must not run");
        },
        ai: async () => ({ polished: "STAR answer", source: "ai" }),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("ai");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });

  it("gap_analysis: python skipped → deterministic metrics succeed", async () => {
    const route = applyChaosFlags(ROUTES.gap_analysis, {
      forcePythonUnavailable: true,
    });
    const result = await simulateHybridExecution({
      route,
      creditCost: 4,
      runners: {
        deterministic: async () => ({ gaps: ["pace"], score: 65 }),
        python: async () => {
          throw new Error("must not run");
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("deterministic");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });

  it("gov_exam_assemble: python skipped → AI fill after empty database", async () => {
    const route = applyChaosFlags(ROUTES.gov_exam_assemble, {
      forcePythonUnavailable: true,
    });
    const result = await simulateHybridExecution({
      route,
      creditCost: 10,
      runners: {
        database: async () => null,
        python: async () => {
          throw new Error("must not run");
        },
        ai: async () => ({ paper_id: "ai-fill", questions: [{ id: "gen-1" }] }),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("ai");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });

  it("document_process: python skipped → AI enrichment succeeds", async () => {
    const route = applyChaosFlags(ROUTES.document_process, {
      forcePythonUnavailable: true,
    });
    const result = await simulateHybridExecution({
      route,
      creditCost: 5,
      runners: {
        python: async () => {
          throw new Error("must not run");
        },
        ai: async () => ({ summary: "AI-only enrich", pages: 2 }),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("ai");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });
});

describe("runtime failure chaos — compensated fail or fallback", () => {
  it("practice_coach_help: AI runtime fail → refund, no python fallback", async () => {
    const result = await simulateHybridExecution({
      route: ROUTES.practice_coach_help,
      creditCost: 2,
      runners: {
        ai: async () => {
          throw new Error("429");
        },
        python: async () => ({ reply: "fallback coach" }),
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(1);
      assertNoRawGateway(httpStatusForDomainCode(result.code), result.code);
    }
  });

  it("star_builder: AI polish fail → deterministic staged draft", async () => {
    let draft: { action: string } | null = null;
    const result = await simulateHybridExecution({
      route: ROUTES.star_builder,
      creditCost: 3,
      runners: {
        python: async () => {
          draft = { action: "python draft" };
          return null;
        },
        ai: async () => {
          throw new Error("AI unavailable");
        },
        deterministic: async () => draft,
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("deterministic");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });

  it("gap_analysis: python runtime fail → deterministic fallback", async () => {
    const result = await simulateHybridExecution({
      route: { ...ROUTES.gap_analysis, preferredOrder: ["python"] },
      creditCost: 4,
      runners: {
        python: async () => {
          throw new Error("python 503");
        },
        deterministic: async () => ({ gaps: ["structure"], score: 70 }),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });

  it("gov_exam_assemble: python fail → AI fallback (aiFallbackOnPythonFailure)", async () => {
    const result = await simulateHybridExecution({
      route: { ...ROUTES.gov_exam_assemble, preferredOrder: ["database", "python"] },
      creditCost: 10,
      runners: {
        database: async () => null,
        python: async () => {
          throw new Error("factory down");
        },
        ai: async () => ({ paper_id: "fallback-paper", questions: [] }),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("fallback");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
      expect(result.fallbackReason).toMatch(/python_failed/);
    }
  });

  it("document_process: python runtime fail → AI fallback", async () => {
    const result = await simulateHybridExecution({
      route: { ...ROUTES.document_process, preferredOrder: ["python"] },
      creditCost: 5,
      runners: {
        python: async () => {
          throw new Error("extract worker down");
        },
        ai: async () => ({ text: "ai extract", pages: 1 }),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("fallback");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
      expect(result.fallbackReason).toMatch(/python_failed/);
    }
  });

  it("document_process: total failure refunds once (no deterministic path)", async () => {
    const result = await simulateHybridExecution({
      route: applyChaosFlags(ROUTES.document_process, {
        forceAiUnavailable: true,
        forcePythonUnavailable: true,
      }),
      creditCost: 5,
      runners: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(1);
      assertNoRawGateway(httpStatusForDomainCode(result.code), result.code);
    }
  });

  it("gov_exam_assemble: total failure refunds once when all tiers fail", async () => {
    const result = await simulateHybridExecution({
      route: {
        ...ROUTES.gov_exam_assemble,
        preferredOrder: ["database", "python", "ai"],
      },
      creditCost: 10,
      runners: {
        database: async () => null,
        python: async () => {
          throw new Error("python down");
        },
        ai: async () => {
          throw new Error("AI down");
        },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(1);
      expect(result.code).toBe("AI_PROVIDER_UNAVAILABLE");
      assertNoRawGateway(httpStatusForDomainCode(result.code), result.code);
    }
  });
});
