/**
 * Multi-agent validation scaffolding (edge mirror).
 * LLM generator OFF by default — bank-first only.
 */

import {
  findNearDuplicatesInSet,
  isNearDuplicate,
  validateSingleCorrectMcq,
} from "./govMcqValidator.ts";
import {
  scoreQuestionQuality,
  type QualityScoreResult,
} from "./govQualityScore.ts";

/** Feature flag — never silently enable LLM fill for full papers. */
export const ENABLE_LLM_GENERATOR = false;

export type AgentRole =
  | "generator"
  | "solver"
  | "critic"
  | "source_verifier"
  | "pattern_validator"
  | "similarity"
  | "language";

export type AgentVerdict = "pass" | "fail" | "skip" | "disagree";

export type AgentReport = {
  role: AgentRole;
  verdict: AgentVerdict;
  confidence: number;
  codes: string[];
  notes: string[];
};

export type AgentDisagreement = {
  roles: AgentRole[];
  topic: string;
  summary: string;
  reports: AgentReport[];
};

export type MultiAgentBankInput = {
  question_text: string;
  options: string[];
  correct_index: number;
  peers?: string[];
  sourceConfidence?: number;
  language?: string;
};

export type MultiAgentResult = {
  reports: AgentReport[];
  disagreements: AgentDisagreement[];
  quality: QualityScoreResult;
  publishable: boolean;
  llmGeneratorUsed: boolean;
};

export function runBankMultiAgentValidation(
  input: MultiAgentBankInput,
): MultiAgentResult {
  const reports: AgentReport[] = [];

  reports.push({
    role: "generator",
    verdict: "skip",
    confidence: 1,
    codes: ["LLM_GENERATOR_DISABLED"],
    notes: ["LLM generator flag OFF — bank-first assembly only."],
  });

  const mcq = validateSingleCorrectMcq(input);
  reports.push({
    role: "solver",
    verdict: mcq.ok ? "pass" : "fail",
    confidence: mcq.ok ? 0.55 : 0.95,
    codes: mcq.ok ? [] : [mcq.code],
    notes: mcq.ok
      ? ["Structure check only (no subject solver attached)."]
      : [mcq.message],
  });

  reports.push({
    role: "critic",
    verdict: mcq.ok ? "pass" : "fail",
    confidence: 0.7,
    codes: mcq.ok ? [] : [mcq.code],
    notes: mcq.ok ? ["Critic agrees with structure."] : [mcq.message],
  });

  reports.push({
    role: "source_verifier",
    verdict: "pass",
    confidence: input.sourceConfidence ?? 0.75,
    codes: [],
    notes: ["Bank source assumed for pilot."],
  });

  reports.push({
    role: "pattern_validator",
    verdict: "skip",
    confidence: 0.5,
    codes: [],
    notes: ["Pattern snapshots not supplied in bank path."],
  });

  const peers = input.peers ?? [];
  let simFail = false;
  for (const p of peers) {
    if (isNearDuplicate(input.question_text, p)) {
      simFail = true;
      break;
    }
  }
  reports.push({
    role: "similarity",
    verdict: simFail ? "fail" : "pass",
    confidence: 0.9,
    codes: simFail ? ["NEAR_DUPLICATE"] : [],
    notes: simFail ? ["Near-duplicate vs peers."] : ["No near-duplicates."],
  });

  const text = input.question_text ?? "";
  const lang = (input.language ?? "en").toLowerCase();
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  let langVerdict: AgentVerdict = "pass";
  const langCodes: string[] = [];
  if (text.trim().length < 8) {
    langVerdict = "fail";
    langCodes.push("LANGUAGE_TOO_SHORT");
  } else if (lang === "en" && hasDevanagari) {
    langVerdict = "disagree";
    langCodes.push("LANGUAGE_SCRIPT_MISMATCH");
  }
  reports.push({
    role: "language",
    verdict: langVerdict,
    confidence: 0.7,
    codes: langCodes,
    notes: langCodes.length ? langCodes : ["Language check ok."],
  });

  const disagreements: AgentDisagreement[] = [];
  const language = reports.find((r) => r.role === "language");
  if (language?.verdict === "disagree") {
    disagreements.push({
      roles: ["language"],
      topic: "language_script",
      summary: "Language agent disagreement.",
      reports: [language],
    });
  }

  const quality = scoreQuestionQuality({
    question_text: input.question_text,
    options: input.options,
    correct_index: input.correct_index,
    peers,
    sourceConfidence: input.sourceConfidence,
  });

  const hardFail =
    quality.hardFail ||
    reports.some((r) => r.verdict === "fail") ||
    disagreements.length > 0;

  return {
    reports,
    disagreements,
    quality,
    publishable: !hardFail,
    llmGeneratorUsed: false,
  };
}

export function validatePaperSimilarity(stems: string[], threshold = 0.88) {
  const pairs = findNearDuplicatesInSet(stems, threshold);
  return { ok: pairs.length === 0, pairs };
}
