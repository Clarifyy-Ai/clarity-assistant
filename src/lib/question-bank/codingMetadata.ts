/**
 * Coding question payload stored on `questions.metadata.coding` for Question Bank + mock tests.
 */

import {
  buildCodingCreateCasePayload,
  DEFAULT_CODING_CREATE_CASE_FIELDS,
  type CodingCreateCaseFields,
} from "@/lib/coding/createQuestionCases";
import { evaluationModeForLanguage } from "@/lib/coding/languages";

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

export type PlayableQuestionCoding = {
  language: string;
  starter_code: string;
  sample_input: string;
  sample_output: string;
  evaluation_mode: string;
  test_cases: Array<{
    name: string;
    input_json: unknown;
    expected_json: unknown;
  }>;
};

export type CodingUserAnswer = {
  code: string;
  language: string;
};

export const DEFAULT_CODING_FORM_FIELDS: CodingCreateCaseFields & {
  language: string;
  starter_code: string;
} = {
  language: "javascript",
  starter_code: "function solve(input) {\n  return 0;\n}\n",
  ...DEFAULT_CODING_CREATE_CASE_FIELDS,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseQuestionCodingMetadata(raw: unknown): QuestionCodingMetadata | null {
  if (!isRecord(raw)) return null;
  const nested = isRecord(raw.coding) ? raw.coding : raw;
  if (Number(nested.version) !== 1) return null;
  const language = String(nested.language ?? "javascript").trim().toLowerCase();
  const starter = String(nested.starter_code ?? "");
  const sampleInput = String(nested.sample_input ?? "");
  const sampleOutput = String(nested.sample_output ?? "");
  const casesRaw = Array.isArray(nested.test_cases) ? nested.test_cases : [];
  const test_cases: QuestionCodingTestCase[] = casesRaw
    .map((item, idx) => {
      if (!isRecord(item)) return null;
      const name = String(item.name ?? `case_${idx + 1}`).trim() || `case_${idx + 1}`;
      return {
        name,
        input_json: item.input_json ?? item.input ?? null,
        expected_json: item.expected_json ?? item.expected ?? null,
        is_hidden: Boolean(item.is_hidden),
      };
    })
    .filter((item): item is QuestionCodingTestCase => Boolean(item));
  if (!starter.trim() || test_cases.length === 0) return null;
  return {
    version: 1,
    language,
    starter_code: starter,
    sample_input: sampleInput,
    sample_output: sampleOutput,
    evaluation_mode: String(nested.evaluation_mode ?? evaluationModeForLanguage(language)),
    test_cases,
  };
}

export function buildQuestionCodingMetadata(
  fields: CodingCreateCaseFields & { language: string; starter_code: string },
): { ok: true; metadata: QuestionCodingMetadata } | { ok: false; error: string } {
  const built = buildCodingCreateCasePayload(fields);
  if (!built.ok) return built as { ok: false; error: string };
  const language = fields.language.trim().toLowerCase() || "javascript";
  const starter = fields.starter_code.trim();
  if (!starter) return { ok: false, error: "Starter code is required for coding questions." };
  return {
    ok: true,
    metadata: {
      version: 1,
      language,
      starter_code: starter,
      sample_input: built.payload.sample_input,
      sample_output: built.payload.sample_output,
      evaluation_mode: evaluationModeForLanguage(language),
      test_cases: built.payload.cases.map((c) => ({
        name: c.name,
        input_json: c.input_json,
        expected_json: c.expected_json,
        is_hidden: c.is_hidden,
      })),
    },
  };
}

export function wrapQuestionMetadata(coding: QuestionCodingMetadata): Record<string, unknown> {
  return { coding };
}

/** Strip hidden judge cases before exposing metadata during a live attempt. */
export function stripCodingMetadataForPlay(
  metadata: QuestionCodingMetadata | null | undefined,
): PlayableQuestionCoding | null {
  if (!metadata) return null;
  const visible = metadata.test_cases.filter((c) => !c.is_hidden);
  return {
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

export function stripQuestionMetadataForPlay(raw: unknown): Record<string, unknown> | null {
  const coding = parseQuestionCodingMetadata(raw);
  if (!coding) return null;
  const playable = stripCodingMetadataForPlay(coding);
  return playable ? { coding: playable } : null;
}

export function codingFieldsFromMetadata(
  raw: unknown,
): CodingCreateCaseFields & { language: string; starter_code: string } {
  const coding = parseQuestionCodingMetadata(raw);
  if (!coding) return { ...DEFAULT_CODING_FORM_FIELDS };
  const visible = coding.test_cases.find((c) => !c.is_hidden) ?? coding.test_cases[0];
  const hidden = coding.test_cases.find((c) => c.is_hidden) ?? coding.test_cases[1];
  return {
    language: coding.language,
    starter_code: coding.starter_code,
    sampleInput: coding.sample_input,
    sampleOutput: coding.sample_output,
    visibleInput: JSON.stringify(visible?.input_json ?? ""),
    visibleExpected: JSON.stringify(visible?.expected_json ?? ""),
    hiddenInput: JSON.stringify(hidden?.input_json ?? ""),
    hiddenExpected: JSON.stringify(hidden?.expected_json ?? ""),
  };
}

export function parseCodingUserAnswer(raw: unknown): CodingUserAnswer | null {
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

export function serializeCodingUserAnswer(answer: CodingUserAnswer): string {
  return JSON.stringify(answer);
}
