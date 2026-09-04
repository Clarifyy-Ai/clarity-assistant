import { describe, expect, it, beforeEach } from "vitest";
import { useSessionStore } from "@/store/sessionStore";

describe("sessionStore pause accrual", () => {
  beforeEach(() => {
    useSessionStore.getState().resetSession();
    useSessionStore.getState().applyServerLease({
      started_at: "2026-09-04T12:00:00.000Z",
      expires_at: "2026-09-04T12:10:00.000Z",
    });
    useSessionStore.getState().setElapsedSeconds(60);
  });

  it("markPaused is idempotent and markResumed extends expires_at", () => {
    const t0 = Date.parse("2026-09-04T12:01:00.000Z");
    const t1 = Date.parse("2026-09-04T12:03:00.000Z");

    useSessionStore.getState().markPaused(t0);
    useSessionStore.getState().markPaused(t0 + 5_000);
    expect(useSessionStore.getState().paused_at).toBe(new Date(t0).toISOString());

    const pauseMs = useSessionStore.getState().markResumed(t1);
    expect(pauseMs).toBe(120_000);
    expect(useSessionStore.getState().paused_at).toBeNull();
    expect(useSessionStore.getState().total_paused_ms).toBe(120_000);
    expect(useSessionStore.getState().expires_at).toBe("2026-09-04T12:12:00.000Z");
  });

  it("repeat pause accrues without double-counting open windows", () => {
    useSessionStore.getState().markPaused(Date.parse("2026-09-04T12:01:00.000Z"));
    useSessionStore.getState().markResumed(Date.parse("2026-09-04T12:02:00.000Z"));
    useSessionStore.getState().markPaused(Date.parse("2026-09-04T12:04:00.000Z"));
    useSessionStore.getState().markResumed(Date.parse("2026-09-04T12:04:30.000Z"));

    expect(useSessionStore.getState().total_paused_ms).toBe(90_000);
    expect(useSessionStore.getState().expires_at).toBe("2026-09-04T12:11:30.000Z");
    expect(useSessionStore.getState().paused_at).toBeNull();
  });
});
