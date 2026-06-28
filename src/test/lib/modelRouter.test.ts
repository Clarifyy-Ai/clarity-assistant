import { describe, it, expect, vi, beforeEach } from "vitest";
import { selectModel } from "@/lib/ai/modelRouter";
import { useAuthStore } from "@/store/authStore";

beforeEach(() => {
  useAuthStore.setState({ planId: "free" } as never);
});

describe("selectModel plan gating", () => {
  it("forces free users to Gemini when requesting GPT-4o", () => {
    useAuthStore.setState({ planId: "free" } as never);
    expect(selectModel("gpt-4o", "behavioural" as never, false)).toBe("gemini-flash");
  });

  it("allows pro users to keep GPT-4o", () => {
    useAuthStore.setState({ planId: "pro" } as never);
    expect(selectModel("gpt-4o", "behavioural" as never, false)).toBe("gpt-4o");
  });

  it("allows enterprise users to keep Claude", () => {
    useAuthStore.setState({ planId: "enterprise" } as never);
    expect(selectModel("claude-3-5-sonnet", "behavioural" as never, false)).toBe(
      "claude-3-5-sonnet",
    );
  });

  it("defaults empty preference to gemini-flash", () => {
    expect(selectModel("" as never, "behavioural" as never, false)).toBe("gemini-flash");
  });
});
