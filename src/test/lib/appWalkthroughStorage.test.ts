import { describe, it, expect, beforeEach } from "vitest";
import {
  hasCompletedAppWalkthrough,
  markAppWalkthroughCompleted,
} from "@/lib/onboarding/appWalkthroughStorage";

describe("appWalkthroughStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns false for new users", () => {
    expect(hasCompletedAppWalkthrough("user-1")).toBe(false);
  });

  it("returns true after marking complete", () => {
    markAppWalkthroughCompleted("user-1");
    expect(hasCompletedAppWalkthrough("user-1")).toBe(true);
    expect(hasCompletedAppWalkthrough("user-2")).toBe(false);
  });

  it("treats missing user id as completed (do not show tour)", () => {
    expect(hasCompletedAppWalkthrough(undefined)).toBe(true);
  });
});
