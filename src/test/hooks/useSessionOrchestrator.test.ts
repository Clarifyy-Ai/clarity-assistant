import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionOrchestrator } from "@/hooks/useSessionOrchestrator";
import { useSessionStore } from "@/store/sessionStore";

describe("useSessionOrchestrator createSession hint_style", () => {
  beforeEach(() => {
    useSessionStore.getState().resetSession();
  });

  it("stores the provided hint_style instead of overwriting it", async () => {
    const { result } = renderHook(() => useSessionOrchestrator());

    await act(async () => {
      await result.current.createSession({
        session_type: "mock",
        interview_type: "behavioural",
        hint_style: "short_hints",
        session_id: "sess-hint-style",
      });
    });

    expect(useSessionStore.getState().config?.hint_style).toBe("short_hints");
    expect(useSessionStore.getState().session_id).toBe("sess-hint-style");
    expect(useSessionStore.getState().mode).toBe("mock");
  });
});
