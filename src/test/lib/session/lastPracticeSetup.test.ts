import { describe, it, expect, beforeEach } from "vitest";
import {
  stashPendingPracticeSetup,
  peekPendingPracticeSetup,
  consumePendingPracticeSetup,
} from "@/lib/session/lastPracticeSetup";
import type { LiveSessionConfig } from "@/types/session.types";

const SAMPLE: LiveSessionConfig = {
  company: "Meta",
  role: "Software Engineer",
  hint_style: "short_hints",
  model: "gemini-flash",
  smart_routing: false,
  stealth_mode: false,
  resume_id: "resume-1",
  jd_id: null,
  interview_type: "behavioral",
  instructions: "",
  enable_system_audio: true,
};

describe("pending practice setup handoff", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("peek does not consume the stashed config", () => {
    stashPendingPracticeSetup(SAMPLE);
    expect(peekPendingPracticeSetup()?.company).toBe("Meta");
    expect(peekPendingPracticeSetup()?.role).toBe("Software Engineer");
    expect(consumePendingPracticeSetup()?.company).toBe("Meta");
    expect(consumePendingPracticeSetup()).toBeNull();
  });
});
