export type OnboardingStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export type OnboardingProfileSlice = {
  onboarding_completed?: boolean | null;
  onboarding_step?: number | null;
};

/** Derive explicit onboarding state from authoritative profile columns. */
export function deriveOnboardingStatus(
  profile: OnboardingProfileSlice | null | undefined,
): OnboardingStatus {
  if (!profile) return "NOT_STARTED";
  if (profile.onboarding_completed === true) return "COMPLETED";
  const step = Number(profile.onboarding_step ?? 0);
  if (step > 0 && step < 99) return "IN_PROGRESS";
  return "NOT_STARTED";
}
