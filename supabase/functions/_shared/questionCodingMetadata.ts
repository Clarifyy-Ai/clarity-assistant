/** Deno shared helpers for coding questions on the questions table. */

import { runJavascriptSolveTests } from "./javascriptSolveRunner.ts";

export const CODING_AUTO_CORRECT_ANSWER = "__CODING_AUTO__";

export type QuestionCodingTestCase = {
  name: string;
  input_json: unknown;
  expected_json: unknown;
  is_hidden: boolean;
};

export type QuestionCodingMetadata = {
  version: 1;
  language: string;
  starter_code: string;
  sample_input: string;
  sample_output: string;
  evaluation_mode: string;
  test_cases: QuestionCodingTestCase[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseQuestionCodingMetadata(raw: unknown): QuestionCodingMetadata | null {
  if (!isRecord(raw)) return null;
  const nested = isRecord(raw.coding) ? raw.coding : raw;
  if (Number(nested.version) !== 1) return null;
  const starter = String(nested.starter_code ?? "");
  const casesRaw = Array.isArray(nested.test_cases) ? nested.test_cases : [];
  const test_cases: QuestionCodingTestCase[] = casesRaw
    .map((item, idx) => {
      if (!isRecord(item)) return null;
      return {
        name: String(item.name ?? `case_${idx + 1}`).trim() || `case_${idx + 1}`,
        input_json: item.input_json ?? item.input ?? null,
        expected_json: item.expected_json ?? item.expected ?? null,
        is_hidden: Boolean(item.is_hidden),
      };
    })
    .filter((item): item is QuestionCodingTestCase => Boolean(item));
  if (!starter.trim() || test_cases.length === 0) return null;
  return {
    version: 1,
    language: String(nested.language ?? "javascript").trim().toLowerCase(),
    starter_code: starter,
    sample_input: String(nested.sample_input ?? ""),
    sample_output: String(nested.sample_output ?? ""),
    evaluation_mode: String(nested.evaluation_mode ?? "javascript_solve"),
    test_cases,
  };
}

export function parseCodingUserAnswer(raw: unknown): { code: string; language: string } | null {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("{")) {
      try {
        return parseCodingUserAnswer(JSON.parse(trimmed));
      } catch {
        return { code: trimmed, language: "javascript" };
      }
    }
    return { code: trimmed, language: "javascript" };
  }
  if (!isRecord(raw)) return null;
  const code = String(raw.code ?? "").trim();
  if (!code) return null;
  return {
    code,
    language: String(raw.language ?? "javascript").trim().toLowerCase() || "javascript",
  };
}

export function stripCodingMetadataForPlay(
  metadata: QuestionCodingMetadata | null | undefined,
): Record<string, unknown> | null {
  if (!metadata) return null;
  const visible = metadata.test_cases.filter((c) => !c.is_hidden);
  return {
    version: 1,
    language: metadata.language,
    starter_code: metadata.starter_code,
    sample_input: metadata.sample_input,
    sample_output: metadata.sample_output,
    evaluation_mode: metadata.evaluation_mode,
    test_cases: visible.map((c) => ({
      name: c.name,
      input_json: c.input_json,
      expected_json: c.expected_json,
    })),
  };
}

export function evaluateCodingSubmission(
  userAnswer: unknown,
  metadata: QuestionCodingMetadata | null | undefined,
): boolean {
  if (!metadata) return false;
  const parsed = parseCodingUserAnswer(userAnswer);
  if (!parsed?.code) return false;
  const outcome = runJavascriptSolveTests(
    parsed.code,
    metadata.test_cases.map((c, idx) => ({
      id: `case-${idx}`,
      name: c.is_hidden ? "hidden" : c.name,
      input: c.input_json,
      expected: c.expected_json,
    })),
  );
  return outcome.execution_status === "passed"
    && outcome.results.length > 0
    && outcome.results.every((r) => r.passed);
}
