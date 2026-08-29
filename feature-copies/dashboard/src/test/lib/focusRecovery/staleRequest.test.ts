import { describe, it, expect } from "vitest";
import {
  createGenerationGate,
  createAbortableGeneration,
  StaleRequestError,
  reduceDashboardLoadState,
  createDashboardLoadState,
} from "@/lib/focusRecovery/staleRequest";

describe("stale request cancellation", () => {
  it("lets only the newest generation apply", () => {
    const gate = createGenerationGate();
    const first = gate.next();
    const second = gate.next();
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
    expect(() => gate.throwIfStale(first)).toThrow(StaleRequestError);
  });

  it("aborts the previous controller when a newer request begins", () => {
    const gen = createAbortableGeneration();
    const a = gen.begin();
    const b = gen.begin();
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(false);
    expect(gen.isCurrent(a.generation)).toBe(false);
    expect(gen.isCurrent(b.generation)).toBe(true);
  });
});

describe("dashboard loading state transitions", () => {
  it("uses initial loading only when no data exists", () => {
    const start = reduceDashboardLoadState(createDashboardLoadState(false), {
      type: "start",
      hasData: false,
    });
    expect(start.initialLoading).toBe(true);
    expect(start.backgroundRefreshing).toBe(false);
  });

  it("keeps content visible during background refresh", () => {
    const withData = reduceDashboardLoadState(createDashboardLoadState(true), {
      type: "start",
      hasData: true,
    });
    expect(withData.initialLoading).toBe(false);
    expect(withData.backgroundRefreshing).toBe(true);
    expect(withData.hasData).toBe(true);
  });

  it("does not blank the dashboard when a background section fails", () => {
    const failed = reduceDashboardLoadState(
      { ...createDashboardLoadState(true), backgroundRefreshing: true },
      { type: "error", message: "Couldn't load this section. Please retry.", hasData: true },
    );
    expect(failed.initialLoading).toBe(false);
    expect(failed.hasData).toBe(true);
    expect(failed.error).toBeTruthy();
  });

  it("clears loading on cancel without introducing an error", () => {
    const cancelled = reduceDashboardLoadState(
      { ...createDashboardLoadState(true), backgroundRefreshing: true },
      { type: "cancel" },
    );
    expect(cancelled.backgroundRefreshing).toBe(false);
    expect(cancelled.error).toBeNull();
    expect(cancelled.hasData).toBe(true);
  });
});
