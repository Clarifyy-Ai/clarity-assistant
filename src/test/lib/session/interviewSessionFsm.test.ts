import { describe, expect, it } from "vitest";
import {
  canTransitionInterviewLifecycle,
  lifecycleFromLegacyStatus,
  legacyStatusFromLifecycle,
  resolveInterviewLifecycle,
  transitionInterviewLifecycle,
} from "@/lib/session/interviewSessionFsm";

describe("interview session FSM", () => {
  it("maps legacy pending/active/completed/abandoned", () => {
    expect(lifecycleFromLegacyStatus("pending")).toBe("CREATED");
    expect(lifecycleFromLegacyStatus("active")).toBe("IN_PROGRESS");
    expect(lifecycleFromLegacyStatus("paused")).toBe("PAUSED");
    expect(lifecycleFromLegacyStatus("completed")).toBe("COMPLETED");
    expect(lifecycleFromLegacyStatus("abandoned")).toBe("CANCELLED");
  });

  it("allows CREATED → DEVICE_CHECK → READY → IN_PROGRESS → PAUSED → IN_PROGRESS", () => {
    let state = transitionInterviewLifecycle("CREATED", "DEVICE_CHECK");
    state = transitionInterviewLifecycle(state, "READY");
    state = transitionInterviewLifecycle(state, "IN_PROGRESS");
    state = transitionInterviewLifecycle(state, "PAUSED");
    state = transitionInterviewLifecycle(state, "IN_PROGRESS");
    expect(state).toBe("IN_PROGRESS");
  });

  it("allows completion → processing → analyzed", () => {
    let state = transitionInterviewLifecycle("IN_PROGRESS", "COMPLETED");
    state = transitionInterviewLifecycle(state, "PROCESSING");
    state = transitionInterviewLifecycle(state, "ANALYZED");
    expect(state).toBe("ANALYZED");
    expect(canTransitionInterviewLifecycle("ANALYZED", "IN_PROGRESS")).toBe(false);
  });

  it("rejects illegal transitions", () => {
    expect(() => transitionInterviewLifecycle("CREATED", "ANALYZED")).toThrow(/Illegal/);
  });

  it("keeps legacy status compatible for DB writes", () => {
    expect(legacyStatusFromLifecycle("DEVICE_CHECK")).toBe("pending");
    expect(legacyStatusFromLifecycle("IN_PROGRESS")).toBe("active");
    expect(legacyStatusFromLifecycle("ANALYZED")).toBe("completed");
  });

  it("prefers lifecycle_status when present", () => {
    expect(resolveInterviewLifecycle({ lifecycle_status: "READY", status: "pending" })).toBe("READY");
    expect(resolveInterviewLifecycle({ status: "active" })).toBe("IN_PROGRESS");
  });
});
