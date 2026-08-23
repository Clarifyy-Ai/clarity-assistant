import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFocusRecoveryCoordinator } from "@/lib/focusRecovery/coordinator";
import {
  reduceDashboardLoadState,
  createDashboardLoadState,
} from "@/lib/focusRecovery/staleRequest";
import { toSafeUiError } from "@/lib/focusRecovery/safeUiError";
import type { RecoveryAuthContext } from "@/lib/focusRecovery/types";

const auth: RecoveryAuthContext = {
  status: "authenticated",
  hasValidProfile: true,
  profileAgeMs: 200_000,
  roleResolved: true,
  sessionExpiresAtMs: Date.now() + 3_600_000,
};

describe("dashboard focus recovery integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("runs a single recovery that revalidates only stale dashboard queries", async () => {
    const loads: string[] = [];
    const coordinator = createFocusRecoveryCoordinator({
      now: () => 5_000_000,
      isDocumentVisible: () => true,
      readAuth: () => auth,
      runSessionCheck: vi.fn().mockResolvedValue({
        session: { access_token: "ok" },
        refreshed: false,
        expired: false,
        probeFailed: false,
      }),
      config: { coalesceMs: 0, minHiddenMs: 15_000, minIntervalMs: 0 },
    });

    coordinator.subscribe((plan) => {
      for (const resource of plan.revalidate) loads.push(resource);
    });
    coordinator.noteHidden(5_000_000 - 120_000);
    await coordinator.requestRecovery("visibility");

    expect(loads.filter((item) => item === "profile").length).toBeLessThanOrEqual(1);
    expect(loads).toContain("dashboardStats");
    expect(new Set(loads).size).toBe(loads.length);
  });

  it("keeps valid dashboard content while a background refresh is in flight", () => {
    let state = createDashboardLoadState(true);
    state = reduceDashboardLoadState(state, { type: "start", hasData: true });
    expect(state.initialLoading).toBe(false);
    expect(state.backgroundRefreshing).toBe(true);
    state = reduceDashboardLoadState(state, { type: "success", hasData: true });
    expect(state.backgroundRefreshing).toBe(false);
    expect(state.hasData).toBe(true);
  });

  it("does not surface PostgREST internals for a failed non-critical section", () => {
    const message = toSafeUiError(
      new Error("PGRST116 column sessions.foo does not exist"),
      "Couldn't load this section. Please retry.",
    );
    expect(message).not.toMatch(/pgrst|column/i);
    expect(message).toBe("Couldn't load this section. Please retry.");
  });

  it("preserves data when a cancelled request loses the race", () => {
    let state = createDashboardLoadState(true);
    state = reduceDashboardLoadState(state, { type: "start", hasData: true });
    state = reduceDashboardLoadState(state, { type: "cancel" });
    expect(state.hasData).toBe(true);
    expect(state.error).toBeNull();
  });
});
