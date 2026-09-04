import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPROVED_CODING_LANGUAGES,
  CODING_SANDBOX_HONESTY,
  CODING_SANDBOX_STATUS,
  NON_EXECUTABLE_CODING_LANGUAGES,
  isApprovedCodingLanguage,
  isAutoExecutedLanguage,
  isPracticeLanguageFamilyMatch,
  languageOptionLabel,
} from "@/lib/coding/languages";
import { formatCodingExecutionSummary } from "@/lib/coding/sampleResult";
import {
  preparePracticeSource,
  stripTypescriptForPractice,
} from "@/lib/coding/javascriptSolveRunner";

describe("coding languages contract", () => {
  it("exposes only JS/TS practice languages as approved/executable", () => {
    expect([...APPROVED_CODING_LANGUAGES]).toEqual(["javascript", "typescript"]);
    expect(isApprovedCodingLanguage("javascript")).toBe(true);
    expect(isApprovedCodingLanguage("typescript")).toBe(true);
    expect(isApprovedCodingLanguage("python")).toBe(false);
    expect(isAutoExecutedLanguage("typescript")).toBe(true);
    expect(isAutoExecutedLanguage("python")).toBe(false);
  });

  it("keeps non-executable languages out of the approved list with honest labels", () => {
    for (const lang of NON_EXECUTABLE_CODING_LANGUAGES) {
      expect(isApprovedCodingLanguage(lang)).toBe(false);
      expect(languageOptionLabel(lang)).toMatch(/not executed/i);
    }
  });

  it("labels practice languages with partial sandbox honesty", () => {
    expect(languageOptionLabel("javascript")).toMatch(/JavaScript/);
    expect(languageOptionLabel("javascript")).toMatch(/practice auto-scored/i);
    expect(languageOptionLabel("typescript")).toMatch(/TypeScript/);
    expect(CODING_SANDBOX_STATUS).toBe("PARTIAL");
    expect(CODING_SANDBOX_HONESTY).toMatch(/not a secure multi-language sandbox/i);
  });

  it("UI pages reiterate PARTIAL sandbox (no Docker invention)", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
    const assessment = fs.readFileSync(
      path.join(root, "src/pages/app/coding/CodingAssessment.tsx"),
      "utf8",
    );
    const lab = fs.readFileSync(path.join(root, "src/pages/app/coding/CodingLab.tsx"), "utf8");
    expect(assessment).toContain("CODING_SANDBOX_STATUS");
    expect(assessment).toMatch(/PARTIAL/);
    expect(lab).toMatch(/JS\/TS practice scoring only/i);
    expect(assessment).not.toMatch(/Docker sandbox/i);
    expect(assessment).not.toMatch(/\bstartTime\b/);
    expect(lab).not.toMatch(/\bstartTime\b/);
  });

  it("allows JS/TS practice family language match", () => {
    expect(isPracticeLanguageFamilyMatch("typescript", "javascript")).toBe(true);
    expect(isPracticeLanguageFamilyMatch("javascript", "typescript")).toBe(true);
    expect(isPracticeLanguageFamilyMatch("python", "javascript")).toBe(false);
    expect(isPracticeLanguageFamilyMatch("javascript", "python")).toBe(false);
  });
});

describe("typescript practice stripper", () => {
  it("strips simple annotations so solve() compiles", () => {
    const src = stripTypescriptForPractice(
      "function solve(input: number[]): number {\n  return input.reduce((a: number, b: number) => a + b, 0);\n}\n",
    );
    expect(src).not.toMatch(/:\s*number/);
    expect(preparePracticeSource(src, "javascript")).toContain("function solve");
  });
});

describe("formatCodingExecutionSummary unsupported", () => {
  it("returns default unsupported copy", () => {
    expect(formatCodingExecutionSummary({ execution_status: "unsupported" })).toBe(
      "Language not supported for automated scoring.",
    );
  });

  it("prefers edge message when present", () => {
    expect(
      formatCodingExecutionSummary({
        execution_status: "unsupported",
        message: "This language is not configured for secure execution.",
      }),
    ).toBe("This language is not configured for secure execution.");
  });
});
