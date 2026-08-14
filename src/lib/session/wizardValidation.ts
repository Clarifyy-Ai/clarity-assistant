/** Practice Coach setup: required fields per step / session mode. */

export type WizardSessionCallType = "interview" | "regular_call";

export function wizardStepBlocker(opts: {
  step: number;
  resumeStep: number;
  sessionCallType: WizardSessionCallType;
  company: string;
  role: string;
  hintStyle?: string | null;
  model?: string | null;
  smartRouting?: boolean;
  resumeId?: string | null;
}): string | null {
  const { step, resumeStep, sessionCallType } = opts;
  const isInterview = sessionCallType === "interview";

  if (step === 1 && isInterview) {
    if (!opts.role.trim()) return "Choose a target role before continuing.";
    if (!opts.company.trim()) return "Choose a company before continuing.";
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
