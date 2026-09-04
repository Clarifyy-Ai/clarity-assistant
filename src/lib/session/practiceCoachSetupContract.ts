/**
 * Shared Practice Coach setup contract.
 * UI and validation must use the same REQUIRED / OPTIONAL / NOT_REQUIRED rules.
 *
 * "Daily Standup" is stealth labeling of Practice Coach — modes are only
 * interview | regular_call.
 */

export type PracticeCoachCallType = "interview" | "regular_call";

export type SetupFieldRequirement = "REQUIRED" | "OPTIONAL" | "NOT_REQUIRED";

export type PracticeCoachSetupField =
  | "role"
  | "company"
  | "resume"
  | "job_description"
  | "hint_style"
  | "model"
  | "input_mode"
  | "device_readiness"
  | "seniority";

/** Wizard UI steps (1-based). */
export const PRACTICE_COACH_WIZARD_STEPS = {
  goal: 1,
  context: 2,
  settings: 3,
  device: 4,
  review: 5,
} as const;

export function setupFieldRequirement(
  callType: PracticeCoachCallType,
  field: PracticeCoachSetupField,
): SetupFieldRequirement {
  switch (field) {
    case "role":
      return callType === "interview" ? "REQUIRED" : "OPTIONAL";
    case "company":
      return "OPTIONAL";
    case "resume":
      return callType === "interview" ? "REQUIRED" : "OPTIONAL";
    case "job_description":
      return "OPTIONAL";
    case "seniority":
      return callType === "interview" ? "REQUIRED" : "OPTIONAL";
    case "hint_style":
      return "REQUIRED";
    case "model":
      return "REQUIRED"; // satisfied by explicit model OR smart routing
    case "input_mode":
      return "REQUIRED";
    case "device_readiness":
      // Only when voice input mode is selected (enforced in wizard, not here).
      return "OPTIONAL";
    default:
      return "NOT_REQUIRED";
  }
}

export function requirementLabel(req: SetupFieldRequirement): string {
  if (req === "REQUIRED") return "Required";
  if (req === "OPTIONAL") return "Optional";
  return "";
}
