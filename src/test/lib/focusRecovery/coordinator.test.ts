import { describe, it, expect } from "vitest";
import { decideFocusRecovery } from "@/lib/focusRecovery/decideRecovery";
import { DEFAULT_FOCUS_RECOVERY_CONFIG } from "@/lib/focusRecovery/types";
import type { RecoveryAuthContext } from "@/lib/focusRecovery/types";

const authOk: RecoveryAuthContext = {
  status: "authenticated",
  hasValidProfile: true,
  profileAgeMs: 5_000,
  roleResolved: true,
  sessionExpiresAtMs: Date.now() + 3_600_000,
};

function input(overrides: Partial<Parameters<typeof decideFocusRecovery>[0]> = {}) {
  return decideFocusRecovery({
    now: 1_000_000,
    isVisible: true,
    trigger: "visibility",
    persistedPageshow: false,
    hiddenDurationMs: 0,
    msSinceLastRecovery: null,
    inFlight: false,
    auth: authOk,
    config: DEFAULT_FOCUS_RECOVERY_CONFIG,
    ...overrides,
  });
}

describe("decideFocusRecovery", () => {
  it("skips recovery while the document is still hidden", () => {
    expect(input({ isVisible: false }).shouldRecover).toBe(false);
    expect(input({ isVisible: false }).reason).toBe("hidden");
  });

  it("dedupes overlapping in-flight recovery", () => {
    const plan = input({
      inFlight: true,
      hiddenDurationMs: 120_000,
    });
    expect(plan.shouldRecover).toBe(false);
    expect(plan.reason).toBe("duplicate");
  });

  it("dedupes bursts within minIntervalMs", () => {
    const plan = input({
      hiddenDurationMs: 120_000,
      msSinceLastRecovery: 200,
    });
    expect(plan.shouldRecover).toBe(false);
    expect(plan.reason).toBe("duplicate");
  });

  it("skips quick tab flickers when profile and session are fresh", () => {
    const plan = input({ hiddenDurationMs: 2_000 });
    expect(plan.shouldRecover).toBe(false);
    expect(plan.reason).toBe("not_needed");
  });

  it("revalidates dashboard stats after ~2 minutes hidden", () => {
    const plan = input({ hiddenDurationMs: 120_000, auth: { ...authOk, profileAgeMs: 120_000 } });
    expect(plan.shouldRecover).toBe(true);
    expect(plan.revalidate).toContain("dashboardStats");
    expect(plan.revalidate).toContain("dashboardActivity");
    expect(plan.revalidate).toContain("profile");
    expect(plan.revalidate).not.toContain("documents");
  });

  it("does not refetch a fresh profile after 2 minutes if cache is still warm", () => {
    const plan = input({
      hiddenDurationMs: 120_000,
      auth: { ...authOk, profileAgeMs: 10_000 },
    });
    expect(plan.shouldRecover).toBe(true);
    expect(plan.revalidate).toContain("dashboardStats");
    expect(plan.revalidate).not.toContain("profile");
  });

  it("refreshes the session when the access token is near expiry", () => {
    const now = 1_000_000;
    const plan = input({
      now,
      hiddenDurationMs: 1_000,
      auth: { ...authOk, sessionExpiresAtMs: now + 10_000 },
    });
    expect(plan.shouldRecover).toBe(true);
    expect(plan.refreshSession).toBe(true);
    expect(plan.reason).toBe("session");
  });

  it("treats bfcache pageshow as a forced recovery", () => {
    const plan = input({
      trigger: "pageshow",
      persistedPageshow: true,
      hiddenDurationMs: 0,
    });
    expect(plan.shouldRecover).toBe(true);
    expect(plan.reason).toBe("bfcache");
    expect(plan.revalidate).toContain("profile");
  });
});
