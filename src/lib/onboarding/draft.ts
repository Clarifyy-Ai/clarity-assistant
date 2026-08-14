import type { OnboardingData } from "@/types/onboarding.types";

const DRAFT_KEY = "clarify:onboarding-draft";

export type OnboardingDraft = {
  step: number;
  data: Partial<OnboardingData>;
};

// Uses localStorage (not sessionStorage) so a full browser refresh/close and
// reopen still restores the exact step + entered values instead of resetting
// to an empty Essentials screen.
export function loadOnboardingDraft(): OnboardingDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingDraft;
    if (!parsed || typeof parsed !== "object") return null;
    const step = typeof parsed.step === "number" ? parsed.step : 1;
    return { step: step >= 1 && step <= 2 ? step : 1, data: parsed.data ?? {} };
  } catch {
    return null;
  }
}

export function saveOnboardingDraft(step: number, data: Partial<OnboardingData>): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, data }));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function clearOnboardingDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore.
  }
}
