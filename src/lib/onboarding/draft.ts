import type { OnboardingData } from "@/types/onboarding.types";

const DRAFT_KEY = "clarify:onboarding-draft";

export type OnboardingDraft = {
  step: number;
  data: Partial<OnboardingData>;
};

export function loadOnboardingDraft(): OnboardingDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
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
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, data }));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function clearOnboardingDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore.
  }
}
