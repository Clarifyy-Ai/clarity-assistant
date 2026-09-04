import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isCustomPracticeGenerateDisabled,
  resolveGeneratorReadiness,
  type GeneratorReadinessInput,
} from "@/lib/gov-exam/generatorReadiness";

const base = (overrides: Partial<GeneratorReadinessInput> = {}): GeneratorReadinessInput => ({
  examId: "exam-1",
  stageId: "stage-1",
  step: 3,
  creditsKnown: true,
  creditAllowed: true,
  creditInsufficient: false,
  busy: false,
  jobInFlight: false,
  inventoryCanGenerate: true,
  customPracticeMax: 25,
  deepLinkHydrating: false,
  creditsTimedOut: false,
  ...overrides,
});

describe("resolveGeneratorReadiness", () => {
  it("disables Continue when no exam selected", () => {
    const r = resolveGeneratorReadiness(base({ examId: "", step: 0 }));
    expect(r.phase).toBe("INVALID");
    expect(r.continueEnabled).toBe(false);
    expect(r.reason).toBe("no_exam");
  });

  it("enables Continue after exam selected without needing credits", () => {
    const r = resolveGeneratorReadiness(
      base({
        step: 0,
        creditsKnown: false,
        creditAllowed: false,
        stageId: "stage-1",
      }),
    );
    expect(r.continueEnabled).toBe(true);
    expect(r.generateDisabled).toBe(true);
    expect(r.phase).toBe("READY");
  });

  it("stays INITIALIZING while deep-link hydrating but Continue enables when examId present", () => {
    const r = resolveGeneratorReadiness(
      base({ deepLinkHydrating: true, step: 0, examId: "exam-1" }),
    );
    expect(r.phase).toBe("INITIALIZING");
    expect(r.continueEnabled).toBe(true);
    expect(r.generateDisabled).toBe(true);
    expect(r.reason).toBe("hydrating");
  });

  it("keeps Continue disabled while hydrating without examId", () => {
    const r = resolveGeneratorReadiness(
      base({ deepLinkHydrating: true, step: 0, examId: "" }),
    );
    expect(r.continueEnabled).toBe(false);
    expect(r.reason).toBe("hydrating");
  });

  it("blocks Generate when stage missing on step 3", () => {
    const r = resolveGeneratorReadiness(base({ stageId: "", step: 3 }));
    expect(r.phase).toBe("INVALID");
    expect(r.generateDisabled).toBe(true);
    expect(r.reason).toBe("no_stage");
    expect(r.continueEnabled).toBe(true);
  });

  it("shows checking_credits while balance unknown", () => {
    const r = resolveGeneratorReadiness(
      base({ creditsKnown: false, creditAllowed: false, step: 3 }),
    );
    expect(r.phase).toBe("INITIALIZING");
    expect(r.generateDisabled).toBe(true);
    expect(r.generateLabelHint).toBe("checking_credits");
  });

  it("surfaces retry_credits after timeout with unknown balance", () => {
    const r = resolveGeneratorReadiness(
      base({
        creditsKnown: false,
        creditAllowed: false,
        creditsTimedOut: true,
        step: 3,
      }),
    );
    expect(r.reason).toBe("credits_timeout");
    expect(r.generateLabelHint).toBe("retry_credits");
  });

  it("disables Generate for insufficient credits with top_up label", () => {
    const r = resolveGeneratorReadiness(
      base({
        creditAllowed: false,
        creditInsufficient: true,
        step: 3,
      }),
    );
    expect(r.generateDisabled).toBe(true);
    expect(r.generateLabelHint).toBe("top_up");
    expect(r.reason).toBe("credits_insufficient");
  });

  it("enables Generate when READY with inventory and credits", () => {
    const r = resolveGeneratorReadiness(base());
    expect(r.phase).toBe("READY");
    expect(r.generateDisabled).toBe(false);
    expect(r.reason).toBe("ok");
  });

  it("blocks when inventory insufficient and custom practice under floor", () => {
    const r = resolveGeneratorReadiness(
      base({
        inventoryCanGenerate: false,
        customPracticeMax: 3,
      }),
    );
    expect(r.generateDisabled).toBe(true);
    expect(r.reason).toBe("inventory_blocked");
  });

  it("allows Generate path readiness when custom practice max >= 5 even if full inventory blocked", () => {
    const r = resolveGeneratorReadiness(
      base({
        inventoryCanGenerate: false,
        customPracticeMax: 10,
      }),
    );
    expect(r.generateDisabled).toBe(false);
    expect(r.reason).toBe("ok");
  });

  it("disables for busy and in-flight job", () => {
    expect(resolveGeneratorReadiness(base({ busy: true })).reason).toBe("busy");
    expect(resolveGeneratorReadiness(base({ jobInFlight: true })).reason).toBe("job_in_flight");
  });
});

describe("isCustomPracticeGenerateDisabled", () => {
  it("requires customPracticeMax >= 5", () => {
    const ready = resolveGeneratorReadiness(base({ inventoryCanGenerate: false, customPracticeMax: 10 }));
    expect(isCustomPracticeGenerateDisabled(ready, 4)).toBe(true);
    expect(isCustomPracticeGenerateDisabled(ready, 10)).toBe(false);
  });
});

describe("GenerateGovPaper contract", () => {
  it("does not import OverlayActivityTimer or interview startTime refs", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/pages/app/mock-test/GenerateGovPaper.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/OverlayActivityTimer/);
    expect(src).not.toMatch(/startTimeRef/);
    expect(src).toMatch(/resolveGeneratorReadiness/);
    expect(src).toMatch(/GovPaperReviewGenerationTimer/);
  });
});
