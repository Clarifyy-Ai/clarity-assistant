import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLivePreferencePromptBlock,
  mapSeniorityToExperienceLevel,
} from "@/lib/session/liveSessionPreferences";
import { wizardRequiredFieldsBlocker } from "@/lib/session/wizardValidation";
import { setupFieldRequirement } from "@/lib/session/practiceCoachSetupContract";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("liveSessionPreferences", () => {
  it("builds preference block with Answer Bank, emphasize, and do-not-claim", () => {
    const block = buildLivePreferencePromptBlock(
      {
        seniority: "Senior",
        focus_competencies: ["Leadership"],
        skills_to_emphasize: ["React"],
        skills_not_to_claim: ["Kubernetes"],
        topics_to_avoid: ["Salary"],
      },
      ["STAR story about an outage"],
    );
    expect(block).toContain("Seniority: Senior");
    expect(block).toContain("Skills to emphasize: React");
    expect(block).toContain("Skills NOT to claim");
    expect(block).toContain("Kubernetes");
    expect(block).toContain("STAR story about an outage");
  });

  it("maps wizard seniority labels to experience levels", () => {
    expect(mapSeniorityToExperienceLevel("Junior")).toBe("junior");
    expect(mapSeniorityToExperienceLevel("Mid")).toBe("mid");
    expect(mapSeniorityToExperienceLevel("Lead")).toBe("staff");
    expect(mapSeniorityToExperienceLevel("")).toBeNull();
  });
});

describe("practice coach seniority requirement", () => {
  it("requires seniority for interview starts", () => {
    expect(setupFieldRequirement("interview", "seniority")).toBe("REQUIRED");
    expect(
      wizardRequiredFieldsBlocker({
        sessionCallType: "interview",
        role: "Engineer",
        resumeId: "r1",
        hintStyle: "short_hints",
        model: "gemini-flash",
        smartRouting: false,
        seniority: "",
      }),
    ).toMatch(/seniority|experience level/i);
    expect(
      wizardRequiredFieldsBlocker({
        sessionCallType: "interview",
        role: "Engineer",
        resumeId: "r1",
        hintStyle: "short_hints",
        model: "gemini-flash",
        smartRouting: false,
        seniority: "Senior",
      }),
    ).toBeNull();
  });
});

describe("live preference wire-up contracts", () => {
  it("useLiveCopilot and geminiClient forward preference context", () => {
    const live = fs.readFileSync(path.join(root, "src/hooks/useLiveCopilot.ts"), "utf8");
    const gemini = fs.readFileSync(path.join(root, "src/lib/ai/geminiClient.ts"), "utf8");
    expect(live).toContain("buildLivePreferencePromptBlock");
    expect(live).toContain("skills_not_to_claim");
    expect(gemini).toContain("preference_context");
    expect(gemini).toContain("skills_not_to_claim");
  });

  it("AI Help confirm and SessionDetail turn grouping are present", () => {
    const hint = fs.readFileSync(
      path.join(root, "src/components/overlay/OverlayHintPanel.tsx"),
      "utf8",
    );
    const detail = fs.readFileSync(
      path.join(root, "src/pages/app/sessions/SessionDetail.tsx"),
      "utf8",
    );
    const blocker = fs.readFileSync(
      path.join(root, "src/components/overlay/ScreenCaptureBlocker.tsx"),
      "utf8",
    );
    expect(hint).toMatch(/Generate Answer|ai_help_confirm|confidence/i);
    expect(detail).toContain("buildSessionTranscriptView");
    expect(blocker).not.toMatch(/capture resistance|hide from share/i);
  });
});
