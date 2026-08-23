import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFocusRecoveryCoordinator } from "@/lib/focusRecovery/coordinator";
import type { RecoveryAuthContext } from "@/lib/focusRecovery/types";

describe("FocusRecoveryCoordinator event coalescing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const auth: RecoveryAuthContext = {
    status: "authenticated",
    hasValidProfile: true,
    profileAgeMs: 200_000,
    roleResolved: true,
    sessionExpiresAtMs: Date.now() + 3_600_000,
  };

  it("collapses visibility + focus + pageshow into one recovery", async () => {
    const runSessionCheck = vi.fn().mockResolvedValue({
      session: { access_token: "t" },
      refreshed: false,
      expired: false,
      probeFailed: false,
    });
    const listener = vi.fn();
    let now = 1_000_000;
    let visible = true;

    const coordinator = createFocusRecoveryCoordinator({
      now: () => now,
      isDocumentVisible: () => visible,
      readAuth: () => auth,
      runSessionCheck,
      config: { coalesceMs: 400, minHiddenMs: 15_000, minIntervalMs: 2_000 },
    });
    coordinator.subscribe(listener);
    coordinator.noteHidden(now - 120_000);

    coordinator.noteVisible("visibility");
    coordinator.noteVisible("focus");
    coordinator.noteVisible("pageshow");

    expect(listener).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(runSessionCheck).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot().recoveryCount).toBe(1);
  });

  it("does not recover while still hidden", async () => {
    const listener = vi.fn();
    const coordinator = createFocusRecoveryCoordinator({
      now: () => 1_000_000,
      isDocumentVisible: () => false,
      readAuth: () => auth,
      runSessionCheck: vi.fn(),
    });
    coordinator.subscribe(listener);
    coordinator.noteVisible("visibility");
    await vi.advanceTimersByTimeAsync(500);
    expect(listener).not.toHaveBeenCalled();
    expect(coordinator.getLastPlan()?.reason).toBe("hidden");
  });

  it("queues a trailing recovery instead of overlapping", async () => {
    let resolveSession: (value: unknown) => void = () => undefined;
    const runSessionCheck = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSession = resolve;
        }),
    );
    const listener = vi.fn();
    const coordinator = createFocusRecoveryCoordinator({
      now: () => 2_000_000,
      isDocumentVisible: () => true,
      readAuth: () => auth,
      runSessionCheck: runSessionCheck as never,
      config: { coalesceMs: 0, minHiddenMs: 1, minIntervalMs: 0 },
    });
    coordinator.subscribe(listener);
    coordinator.noteHidden(2_000_000 - 120_000);

    const first = coordinator.requestRecovery("visibility");
    const second = coordinator.requestRecovery("focus");
    expect(runSessionCheck).toHaveBeenCalledTimes(1);

    resolveSession({
      session: { access_token: "t" },
      refreshed: false,
      expired: false,
      probeFailed: false,
    });
    await first;
    await second;
    await vi.advanceTimersByTimeAsync(0);
    expect(coordinator.getSnapshot().recoveryCount).toBeGreaterThanOrEqual(1);
  });
});
