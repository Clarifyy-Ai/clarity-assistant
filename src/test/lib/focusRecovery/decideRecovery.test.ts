import { describe, expect, it } from "vitest";
import { decideFocusRecovery } from "@/lib/focusRecovery/decideRecovery";
import { DEFAULT_FOCUS_RECOVERY_CONFIG } from "@/lib/focusRecovery/types";

const base = {
  now: 1_000_000,
  isVisible: true,
  trigger: "visibility" as const,
  persistedPageshow: false,
  hiddenDurationMs: 0,
  msSinceLastRecovery: null,
  inFlight: false,
  config: DEFAULT_FOCUS_RECOVERY_CONFIG,
};

describe("decideFocusRecovery", () => {
  it("skips recovery while unauthenticated", () => {
    const plan = decideFocusRecovery({
      ...base,
      auth: {
        status: "unauthenticated",
        hasValidProfile: false,
        profileAgeMs: null,
        roleResolved: false,
        sessionExpiresAtMs: null,
      },
    });
    expect(plan.shouldRecover).toBe(false);
    expect(plan.reason).toBe("not_needed");
  });

  it("revalidates profile when authenticated profile is stale", () => {
    const plan = decideFocusRecovery({
      ...base,
      hiddenDurationMs: 20_000,
      auth: {
        status: "authenticated",
        hasValidProfile: true,
        profileAgeMs: 180_000,
        roleResolved: true,
        sessionExpiresAtMs: 1_000_000 + 120_000,
      },
    });
    expect(plan.shouldRecover).toBe(true);
    expect(plan.revalidate).toContain("profile");
  });

  it("dedupes when a recovery is already in flight", () => {
    const plan = decideFocusRecovery({
      ...base,
      inFlight: true,
      auth: {
        status: "authenticated",
        hasValidProfile: true,
        profileAgeMs: 10_000,
        roleResolved: true,
        sessionExpiresAtMs: 1_000_000 + 120_000,
      },
    });
    expect(plan.shouldRecover).toBe(false);
    expect(plan.reason).toBe("duplicate");
  });
});
