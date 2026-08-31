const TOTAL_STEPS = 2;

export type OnboardingHistoryState = {
  onboardingStep: number;
};

export function isOnboardingHistoryState(
  value: unknown,
): value is OnboardingHistoryState {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    "onboardingStep" in (value as Record<string, unknown>) &&
    Number.isInteger((value as OnboardingHistoryState).onboardingStep)
  );
}

/** Map a browser Back/Forward event to a valid onboarding step. */
export function stepFromPopState(
  state: unknown,
  currentStep: number,
  totalSteps = TOTAL_STEPS,
): number {
  if (isOnboardingHistoryState(state)) {
    const step = state.onboardingStep;
    if (step >= 1 && step <= totalSteps) return step;
  }
  return Math.min(totalSteps, Math.max(1, currentStep - 1));
}

export function onboardingHistoryState(step: number): OnboardingHistoryState {
  return { onboardingStep: step };
}
