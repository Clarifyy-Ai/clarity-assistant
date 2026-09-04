/**
 * Interview blueprint — planned phases before the first question.
 */

import type { InterviewContextSnapshot } from "@/lib/mock/interviewContext";

export const BLUEPRINT_VERSION = "interview_blueprint_v1";

export type BlueprintPhaseId =
  | "introduction"
  | "resume_project"
  | "technical"
  | "behavioral"
  | "problem_solving"
  | "closing";

export type BlueprintSlot = {
  sequence: number;
  phase: BlueprintPhaseId;
  competency: string;
  question_type: string;
  difficulty: "easy" | "medium" | "hard";
  is_closing: boolean;
  max_follow_ups: number;
};

export type InterviewBlueprint = {
  version: typeof BLUEPRINT_VERSION;
  created_at: string;
  total_questions: number;
  max_follow_ups_per_topic: number;
  follow_up_depth: "none" | "light" | "deep";
  slots: BlueprintSlot[];
  time_budget_minutes: number;
};

const TYPE_PHASE_MAP: Record<string, BlueprintPhaseId[]> = {
  behavioural: ["introduction", "behavioral", "behavioral", "closing"],
  behavioral: ["introduction", "behavioral", "behavioral", "closing"],
  technical: ["introduction", "technical", "technical", "closing"],
  coding: ["introduction", "technical", "technical", "closing"],
  system_design: ["introduction", "problem_solving", "problem_solving", "closing"],
  hr: ["introduction", "behavioral", "resume_project", "closing"],
  leadership: ["introduction", "behavioral", "behavioral", "closing"],
  case_study: ["introduction", "problem_solving", "behavioral", "closing"],
  mixed: [
    "introduction",
    "resume_project",
    "technical",
    "behavioral",
    "problem_solving",
    "closing",
  ],
  product: ["introduction", "problem_solving", "behavioral", "closing"],
  managerial: ["introduction", "behavioral", "behavioral", "closing"],
};

function phaseCompetency(phase: BlueprintPhaseId): string {
  switch (phase) {
    case "introduction":
      return "profile";
    case "resume_project":
      return "experience";
    case "technical":
      return "technical_depth";
    case "behavioral":
      return "behavioral";
    case "problem_solving":
      return "problem_solving";
    case "closing":
      return "reflection";
    default:
      return "general";
  }
}

function phaseQuestionType(phase: BlueprintPhaseId, interviewType: string): string {
  if (phase === "behavioral") return "behavioral";
  if (phase === "technical") return "technical";
  if (phase === "problem_solving") {
    return interviewType === "system_design" ? "system_design" : "technical";
  }
  if (phase === "resume_project") return "behavioral";
  if (phase === "closing") return "behavioral";
  return interviewType || "mixed";
}

function followUpCap(depth: "none" | "light" | "deep"): number {
  if (depth === "none") return 0;
  if (depth === "deep") return 2;
  return 1;
}

function difficultyForIndex(
  i: number,
  total: number,
  base: InterviewContextSnapshot["difficulty"],
): "easy" | "medium" | "hard" {
  if (base === "easy") return "easy";
  if (base === "hard") return "hard";
  if (base === "medium") return i < total / 3 ? "easy" : i > (2 * total) / 3 ? "hard" : "medium";
  // mixed
  if (i === 0) return "easy";
  if (i >= total - 1) return "medium";
  return i % 3 === 0 ? "hard" : i % 2 === 0 ? "easy" : "medium";
}

/** Deterministic blueprint from context (no LLM required for Phase 1 reliability). */
export function buildInterviewBlueprint(
  context: InterviewContextSnapshot,
  now = new Date(),
): InterviewBlueprint {
  const total = Math.max(1, Math.min(20, context.planned_question_count));
  const typeKey = (context.interview_type || "mixed").toLowerCase();
  const template = TYPE_PHASE_MAP[typeKey] ?? TYPE_PHASE_MAP.mixed;
  const depth = context.follow_up_depth;
  const maxFollow = followUpCap(depth);

  const phases: BlueprintPhaseId[] = [];
  for (let i = 0; i < total; i += 1) {
    if (i === 0) {
      phases.push("introduction");
    } else if (i === total - 1) {
      phases.push("closing");
    } else {
      const mid = template.filter((p) => p !== "introduction" && p !== "closing");
      phases.push(mid[(i - 1) % Math.max(1, mid.length)] ?? "behavioral");
    }
  }

  const slots: BlueprintSlot[] = phases.map((phase, index) => ({
    sequence: index + 1,
    phase,
    competency: phaseCompetency(phase),
    question_type: phaseQuestionType(phase, typeKey),
    difficulty: difficultyForIndex(index, total, context.difficulty),
    is_closing: phase === "closing",
    max_follow_ups: phase === "closing" || phase === "introduction" ? 0 : maxFollow,
  }));

  return {
    version: BLUEPRINT_VERSION,
    created_at: now.toISOString(),
    total_questions: total,
    max_follow_ups_per_topic: maxFollow,
    follow_up_depth: depth,
    slots,
    time_budget_minutes: context.duration_minutes,
  };
}

export function validateInterviewBlueprint(
  blueprint: InterviewBlueprint,
  context: InterviewContextSnapshot,
): string | null {
  if (blueprint.version !== BLUEPRINT_VERSION) return "Unsupported blueprint version.";
  if (blueprint.slots.length !== blueprint.total_questions) {
    return "Blueprint slot count does not match total questions.";
  }
  if (blueprint.total_questions !== context.planned_question_count) {
    return "Blueprint question count does not match session setup.";
  }
  if (blueprint.slots.length === 0) return "Blueprint has no questions.";
  const sequences = new Set(blueprint.slots.map((s) => s.sequence));
  if (sequences.size !== blueprint.slots.length) return "Duplicate blueprint sequences.";
  if (!blueprint.slots.some((s) => s.is_closing)) {
    return "Blueprint must include a closing question.";
  }
  if (blueprint.time_budget_minutes > context.duration_minutes + 1) {
    return "Blueprint exceeds selected duration.";
  }
  return null;
}

export function getBlueprintSlot(
  blueprint: InterviewBlueprint,
  sequence: number,
): BlueprintSlot | null {
  return blueprint.slots.find((s) => s.sequence === sequence) ?? null;
}

export function isInterviewBlueprint(value: unknown): value is InterviewBlueprint {
  if (!value || typeof value !== "object") return false;
  const v = value as InterviewBlueprint;
  return (
    v.version === BLUEPRINT_VERSION &&
    Array.isArray(v.slots) &&
    typeof v.total_questions === "number"
  );
}
