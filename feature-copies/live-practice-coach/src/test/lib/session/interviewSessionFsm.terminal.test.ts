import { describe, expect, it } from "vitest";
import {
  canTransitionInterviewLifecycle,
  legacyStatusFromLifecycle,
} from "@/lib/session/interviewSessionFsm";

describe("interview session terminal states", () => {
  it("distinguishes expired from completed", () => {
    expect(canTransitionInterviewLifecycle("IN_PROGRESS", "EXPIRED")).toBe(true);
    expect(canTransitionInterviewLifecycle("EXPIRED", "IN_PROGRESS")).toBe(false);
    expect(legacyStatusFromLifecycle("EXPIRED")).toBe("abandoned");
    expect(legacyStatusFromLifecycle("COMPLETED")).toBe("completed");
    expect(legacyStatusFromLifecycle("ENDING")).toBe("active");
  });
});
