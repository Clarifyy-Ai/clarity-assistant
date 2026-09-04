import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_CODING_CREATE_CASE_FIELDS,
  buildCodingCreateCasePayload,
} from "@/lib/coding/createQuestionCases";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("buildCodingCreateCasePayload", () => {
  it("builds sum defaults as valid insert payload", () => {
    const built = buildCodingCreateCasePayload(DEFAULT_CODING_CREATE_CASE_FIELDS);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload.sample_input).toBe("[2, 3]");
    expect(built.payload.sample_output).toBe("5");
    expect(built.payload.cases).toEqual([
      {
        name: "sample",
        input_json: [2, 3],
        expected_json: 5,
        is_hidden: false,
        sort_order: 0,
      },
      {
        name: "hidden",
        input_json: [9, 1],
        expected_json: 10,
        is_hidden: true,
        sort_order: 1,
      },
    ]);
  });

  it("rejects when sample output disagrees with visible expected (create-path contract)", () => {
    const built = buildCodingCreateCasePayload({
      sampleInput: "[2, 3]",
      sampleOutput: "5",
      visibleInput: "[2, 3]",
      visibleExpected: "3",
      hiddenInput: "[9, 1]",
      hiddenExpected: "9",
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.error).toMatch(/Sample output must match/i);
  });

  it("accepts max-value cases when admin enters matching expected JSON", () => {
    const built = buildCodingCreateCasePayload({
      sampleInput: "[2, 3]",
      sampleOutput: "3",
      visibleInput: "[2, 3]",
      visibleExpected: "3",
      hiddenInput: "[9, 1]",
      hiddenExpected: "9",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload.sample_output).toBe("3");
    expect(built.payload.cases[0]?.expected_json).toBe(3);
    expect(built.payload.cases[1]?.expected_json).toBe(9);
  });

  it("rejects invalid JSON in case fields", () => {
    const built = buildCodingCreateCasePayload({
      ...DEFAULT_CODING_CREATE_CASE_FIELDS,
      visibleExpected: "not-json",
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.error).toMatch(/valid JSON/i);
  });
});

describe("CodingLab create cases contract", () => {
  it("inserts cases via buildCodingCreateCasePayload, not hardcoded expected_json: 5", () => {
    const src = fs.readFileSync(
      path.join(root, "src/pages/app/coding/CodingLab.tsx"),
      "utf8",
    );
    expect(src).toContain("buildCodingCreateCasePayload");
    expect(src).toContain("payload.sample_output");
    expect(src).toContain("payload.cases.map");
    expect(src).not.toMatch(/expected_json:\s*5/);
    expect(src).not.toMatch(/sample_output:\s*"5"/);
  });
});
