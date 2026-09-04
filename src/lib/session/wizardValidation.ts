/** Practice Coach setup: required fields per step / session mode. */

import {
  PRACTICE_COACH_WIZARD_STEPS,
  setupFieldRequirement,
  type PracticeCoachCallType,
} from "@/lib/session/practiceCoachSetupContract";

export type WizardSessionCallType = PracticeCoachCallType;

export type WizardFieldOpts = {
  sessionCallType: WizardSessionCallType;
  role: string;
  hintStyle?: string | null;
  model?: string | null;
  smartRouting?: boolean;
  resumeId?: string | null;
  seniority?: string | null;
};

/** Interview mode needs a role, resume, and seniority. Regular call does not. */
export function wizardRequiredFieldsBlocker(opts: WizardFieldOpts): string | null {
  if (setupFieldRequirement(opts.sessionCallType, "role") === "REQUIRED" && !opts.role.trim()) {
    return "Choose a target role before continuing.";
  }
  if (setupFieldRequirement(opts.sessionCallType, "resume") === "REQUIRED" && !opts.resumeId) {
    return "Select a resume so the coach can use your experience.";
  }
  if (
    setupFieldRequirement(opts.sessionCallType, "seniority") === "REQUIRED" &&
    !String(opts.seniority ?? "").trim()
  ) {
    return "Select experience level / seniority before continuing.";
  }
  if (setupFieldRequirement(opts.sessionCallType, "hint_style") === "REQUIRED" && !opts.hintStyle) {
    return "Select a hint style before continuing.";
  }
  if (
    setupFieldRequirement(opts.sessionCallType, "model") === "REQUIRED" &&
    !opts.smartRouting &&
    !opts.model
  ) {
    return "Select an AI model, or enable smart routing.";
  }
  return null;
}

export function wizardStepBlocker(
  opts: WizardFieldOpts & {
    step: number;
    resumeStep: number;
    settingsStep?: number;
  },
): string | null {
  const { step, resumeStep, sessionCallType } = opts;
  const settingsStep = opts.settingsStep ?? PRACTICE_COACH_WIZARD_STEPS.settings;

  if (step === PRACTICE_COACH_WIZARD_STEPS.goal) {
    if (setupFieldRequirement(sessionCallType, "role") === "REQUIRED" && !opts.role.trim()) {
      return "Choose a target role before continuing.";
    }
    if (
      setupFieldRequirement(sessionCallType, "seniority") === "REQUIRED" &&
      !String(opts.seniority ?? "").trim()
    ) {
      return "Select experience level / seniority before continuing.";
    }
  }

  if (step === resumeStep) {
    if (setupFieldRequirement(sessionCallType, "resume") === "REQUIRED" && !opts.resumeId) {
      return "Select a resume so the coach can use your experience.";
    }
  }

  if (step === settingsStep) {
    if (setupFieldRequirement(sessionCallType, "hint_style") === "REQUIRED" && !opts.hintStyle) {
      return "Select a hint style before continuing.";
    }
    if (
      setupFieldRequirement(sessionCallType, "model") === "REQUIRED" &&
      !opts.smartRouting &&
      !opts.model
    ) {
      return "Select an AI model, or enable smart routing.";
    }
  }

  return null;
}

/** Collect human-readable missing items for the disabled Next / Start explanation. */
export function wizardMissingFieldMessages(opts: WizardFieldOpts): string[] {
  const missing: string[] = [];
  if (setupFieldRequirement(opts.sessionCallType, "role") === "REQUIRED" && !opts.role.trim()) {
    missing.push("Target role is required");
  }
  if (setupFieldRequirement(opts.sessionCallType, "resume") === "REQUIRED" && !opts.resumeId) {
    missing.push("Resume is required");
  }
  if (
    setupFieldRequirement(opts.sessionCallType, "seniority") === "REQUIRED" &&
    !String(opts.seniority ?? "").trim()
  ) {
    missing.push("Experience level / seniority is required");
  }
  if (setupFieldRequirement(opts.sessionCallType, "hint_style") === "REQUIRED" && !opts.hintStyle) {
    missing.push("Hint style is required");
  }
  if (
    setupFieldRequirement(opts.sessionCallType, "model") === "REQUIRED" &&
    !opts.smartRouting &&
    !opts.model
  ) {
    missing.push("Select a valid AI model or enable smart routing");
  }
  return missing;
}
