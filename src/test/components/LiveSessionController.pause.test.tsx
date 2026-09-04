/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { LiveSessionController } from "@/components/live/LiveSessionController";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlaySessionAuthorityStore } from "@/store/overlaySessionAuthorityStore";

vi.mock("@/hooks/useNetworkMonitor", () => ({
  useNetworkColor: () => "green",
}));

describe("LiveSessionController pause", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSessionStore.getState().resetSession();
    useSessionStore.getState().setMode("live");
    useSessionStore.getState().setStatus("active");
    useSessionStore.getState().setConfig({
      company: null,
      role: null,
      hint_style: "short_hints",
      model: "gemini-flash",
      smart_routing: true,
      stealth_mode: false,
      resume_id: null,
      jd_id: null,
      interview_type: "behavioural",
      instructions: "",
      enable_system_audio: true,
      duration_minutes: 10,
    } as never);
    useSessionStore.getState().applyServerLease({
      started_at: "2026-09-04T12:00:00.000Z",
      expires_at: "2026-09-04T12:10:00.000Z",
    });
    const gen = useOverlaySessionAuthorityStore.getState().begin({
      mode: "live",
      sessionId: "s1",
    });
    useOverlaySessionAuthorityStore.getState().markReady(gen);
    useOverlaySessionAuthorityStore.getState().markActive(gen);
    vi.setSystemTime(new Date("2026-09-04T12:01:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    useSessionStore.getState().resetSession();
    useOverlaySessionAuthorityStore.getState().clearToIdle(
      useOverlaySessionAuthorityStore.getState().generation,
    );
  });

  it("does not advance elapsed while paused and does not jump on resume", () => {
    const onAutoEnd = vi.fn();
    const { rerender } = render(
      <LiveSessionController isActive onAutoEnd={onAutoEnd} />,
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    const beforePause = useSessionStore.getState().elapsed_seconds;
    expect(beforePause).toBeGreaterThanOrEqual(60);

    act(() => {
      useSessionStore.getState().markPaused(Date.now());
      useSessionStore.getState().setStatus("paused");
    });
    rerender(<LiveSessionController isActive onAutoEnd={onAutoEnd} />);

    const frozen = useSessionStore.getState().elapsed_seconds;
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(useSessionStore.getState().elapsed_seconds).toBe(frozen);
    expect(onAutoEnd).not.toHaveBeenCalled();

    act(() => {
      useSessionStore.getState().markResumed(Date.now());
      useSessionStore.getState().setStatus("active");
    });
    rerender(<LiveSessionController isActive onAutoEnd={onAutoEnd} />);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    const afterResume = useSessionStore.getState().elapsed_seconds;
    // Active elapsed should stay near frozen (+ ~1s tick), not jump by wall pause.
    expect(afterResume).toBeLessThanOrEqual(frozen + 3);
    expect(afterResume).toBeGreaterThanOrEqual(frozen);
  });

  it("suppresses auto-end while paused even if expires_at has passed on wall clock", () => {
    const onAutoEnd = vi.fn();
    useSessionStore.getState().applyServerLease({
      started_at: "2026-09-04T12:00:00.000Z",
      expires_at: "2026-09-04T12:01:05.000Z",
    });
    vi.setSystemTime(new Date("2026-09-04T12:01:00.000Z"));

    const { rerender } = render(
      <LiveSessionController isActive onAutoEnd={onAutoEnd} />,
    );

    act(() => {
      useSessionStore.getState().markPaused(Date.now());
      useSessionStore.getState().setStatus("paused");
    });
    rerender(<LiveSessionController isActive onAutoEnd={onAutoEnd} />);

    act(() => {
      vi.setSystemTime(new Date("2026-09-04T12:02:00.000Z"));
      vi.advanceTimersByTime(5_000);
    });
    expect(onAutoEnd).not.toHaveBeenCalled();
  });
});
