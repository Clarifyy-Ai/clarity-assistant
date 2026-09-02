import { describe, expect, it } from "vitest";
import {
  availabilityParamsFromConfig,
  clampGovDurationMinutes,
  isGenerationConfigComplete,
  modeFromPaperBasis,
  normalizeGenerationConfig,
  parsePaperBasis,
} from "@/lib/gov-exam/generationConfig";

describe("gov exam generation config contract", () => {
  it("normalizes stage, basis, language, duration, and 5-100 question count", () => {
    const config = normalizeGenerationConfig({
      examId: "e1",
      stageId: "s1",
      basis: "quick",
      language: "hi",
      durationMinutes: 45,
      questionCount: 25,
    });
    expect(config.basis).toBe("quick");
    expect(config.language).toBe("hi");
    expect(config.durationMinutes).toBe(45);
    expect(config.questionCount).toBe(25);
    expect(modeFromPaperBasis(config.basis)).toBe("custom_mock");
  });

  it("maps paper basis to the same availability mode used for generation", () => {
    expect(modeFromPaperBasis(parsePaperBasis("full_sim"))).toBe("generated_mock");
    expect(modeFromPaperBasis(parsePaperBasis("official_previous"))).toBe("official_previous");
    const config = normalizeGenerationConfig({
      examId: "e1",
      stageId: "s1",
      basis: "topic",
      questionCount: 10,
      topics: ["Algebra"],
      durationMinutes: 20,
    });
    const params = availabilityParamsFromConfig(config);
    expect(params.mode).toBe("custom_mock");
    expect(params.questionCount).toBe(10);
    expect(params.durationMinutes).toBe(20);
    expect(params.topics).toEqual(["Algebra"]);
    expect(isGenerationConfigComplete(config)).toBe(true);
  });

  it("clamps duration and rejects incomplete topic configs", () => {
    expect(clampGovDurationMinutes(1)).toBe(5);
    expect(clampGovDurationMinutes(999)).toBe(360);
    expect(
      isGenerationConfigComplete(
        normalizeGenerationConfig({ examId: "e1", stageId: "s1", basis: "topic", topics: [] }),
      ),
    ).toBe(false);
  });
});
