/** Practice Coach setup: required fields per step / session mode. */

export type WizardSessionCallType = "interview" | "regular_call";

export type WizardFieldOpts = {
  sessionCallType: WizardSessionCallType;
  role: string;
  hintStyle?: string | null;
  model?: string | null;
  smartRouting?: boolean;
  resumeId?: string | null;
};

/** Interview mode needs a role and a resume. Regular call does not. Company stays optional. */
export function wizardRequiredFieldsBlocker(opts: WizardFieldOpts): string | null {
  if (opts.sessionCallType !== "interview") return null;
  if (!opts.role.trim()) return "Choose a target role before continuing.";
  if (!opts.resumeId) return "Select a resume so the coach can use your experience.";
  return null;
}

export function wizardStepBlocker(
  opts: WizardFieldOpts & {
    step: number;
    resumeStep: number;
  },
): string | null {
  const { step, resumeStep, sessionCallType } = opts;
  const isInterview = sessionCallType === "interview";

  if (step === 1 && isInterview) {
    if (!opts.role.trim()) return "Choose a target role before continuing.";
  }

  if (step === 2) {
    if (!opts.hintStyle) return "Select a hint style before continuing.";
    if (!opts.smartRouting && !opts.model) return "Select an AI model, or enable smart routing.";
  }

  if (step === resumeStep && isInterview) {
    if (!opts.resumeId) return "Select a resume so the coach can use your experience.";
  }

  return null;
}
