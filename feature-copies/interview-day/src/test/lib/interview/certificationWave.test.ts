import { describe, expect, it } from "vitest";
import {
  analysisIsExplainable,
  emptyDimension,
  normalizeAnalysisDimensions,
} from "@/lib/interview/analysisDimensions";
import { buildInterviewPracticePlan, daysUntilInterview } from "@/lib/interview/practicePlan";
import { runVisibleJavascriptTests } from "@/lib/interview/jsVisibleRunner";
import {
  mergeUtteranceText,
  shouldPersistTranscriptSegment,
  transcriptAriaLabel,
  transcriptDisplayKind,
} from "@/lib/audio/transcriptFinality";
import { canUserAReadUserBRow, USER_OWNED_TABLES } from "@/lib/security/rlsTenantIsolation";
import {
  engineForCapability,
  interviewUnlockDoesNotGrantGovAi,
} from "@/lib/billing/productEntitlements";
import { isStealthCaptureFeatureAllowed } from "@/lib/compliance/featureGates";
import { canStartCoachingSession } from "@/lib/overlay/responsibleUseConsent";

describe("explainable analysis", () => {
  it("fills every required dimension with definition and reason", () => {
    const dims = normalizeAnalysisDimensions({
      relevance: {
        score: 70,
        transcript_evidence: "I led the migration.",
        scoring_reason: "Answer named the project but not the asked metric.",
        confidence: 0.6,
        recommendation: "Open with the metric, then the action.",
        improved_example: "We cut p95 latency from 900ms to 220ms by sharding reads.",
      },
    });
    expect(dims).toHaveLength(12);
    expect(dims[0].score).toBe(70);
    expect(dims[1].score).toBeNull();
    expect(analysisIsExplainable(dims)).toBe(true);
    expect(emptyDimension("technical_correctness").score).toBeNull();
  });
});

describe("interview practice plan", () => {
  it("builds activities from weak areas without a fake readiness percent", () => {
    const items = buildInterviewPracticePlan({
      weakAreas: ["STAR structure", "system design"],
      strongAreas: ["communication"],
      missingSkills: ["Kubernetes"],
      targetRole: "Backend Engineer",
    });
    expect(items.some((i) => i.competency === "STAR structure")).toBe(true);
    expect(items.some((i) => i.recommended_route === "/app/documents")).toBe(true);
    expect(JSON.stringify(items)).not.toMatch(/readiness %|99%/i);
    expect(daysUntilInterview("2099-01-01")).toBeGreaterThan(0);
  });
});

describe("visible JS runner", () => {
  it("runs only solve() against visible cases", () => {
    const result = runVisibleJavascriptTests(
      "function solve(input) { return input.a + input.b; }",
      [{ id: "1", name: "sum", input: { a: 1, b: 2 }, expected: 3 }],
    );
    expect(result.ok).toBe(true);
    expect(result.results[0].passed).toBe(true);
  });

  it("blocks network and host APIs", () => {
    const result = runVisibleJavascriptTests("fetch('https://example.com'); function solve(){return 1}", [
      { id: "1", name: "n", input: null, expected: 1 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.blockedReason).toMatch(/Network/);
  });
});

describe("transcript finality", () => {
  it("does not persist interim segments", () => {
    expect(transcriptDisplayKind(false)).toBe("interim");
    expect(transcriptAriaLabel("interim")).toMatch(/not final/i);
    expect(shouldPersistTranscriptSegment(false)).toBe(false);
    expect(shouldPersistTranscriptSegment(true)).toBe(true);
    expect(mergeUtteranceText([{ text: "Hello" }], "wor")).toEqual({
      committed: "Hello",
      pending: "wor",
    });
  });
});

describe("tenant isolation contract", () => {
  it("denies User A reading User B session and resume rows", () => {
    for (const table of USER_OWNED_TABLES) {
      expect(
        canUserAReadUserBRow({
          table,
          ownerId: "tenant-a",
          viewerId: "tenant-b",
        }),
      ).toBe(false);
      expect(
        canUserAReadUserBRow({
          table,
          ownerId: "tenant-a",
          viewerId: "tenant-a",
        }),
      ).toBe(true);
    }
  });
});

describe("product entitlements", () => {
  it("does not let overlay unlock gov-exam AI fill", () => {
    expect(engineForCapability("desktop_overlay")).toBe("interview");
    expect(engineForCapability("gov_exam_ai_fill")).toBe("gov_exam");
    expect(
      interviewUnlockDoesNotGrantGovAi({ hasDesktopOverlay: true, hasGovExamAiFill: false }),
    ).toBe(true);
    expect(
      interviewUnlockDoesNotGrantGovAi({ hasDesktopOverlay: true, hasGovExamAiFill: true }),
    ).toBe(true);
  });
});

describe("overlay ethics", () => {
  it("disables capture-evasion features", () => {
    expect(isStealthCaptureFeatureAllowed()).toBe(false);
  });

  it("requires visible-on-share consent before start", () => {
    expect(
      canStartCoachingSession({
        visibilityAcknowledged: false,
        responsibleUseAcknowledged: true,
        micGranted: true,
      }).ok,
    ).toBe(false);
  });
});
