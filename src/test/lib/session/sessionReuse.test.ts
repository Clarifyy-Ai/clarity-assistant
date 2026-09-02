import { describe, expect, it } from "vitest";
import { shouldReuseExistingSession } from "@/lib/session/sessionReuse";

describe("start-session reuse", () => {
  it("does not reuse active rows (failed End must not overwrite History)", () => {
    expect(
      shouldReuseExistingSession({
        existingStatus: "active",
        existingContextId: null,
        requestContextId: null,
      }),
    ).toBe(false);
  });

  it("never reuses completed", () => {
    expect(
      shouldReuseExistingSession({
        existingStatus: "completed",
        existingContextId: null,
        requestContextId: null,
      }),
    ).toBe(false);
  });

  it("does not reuse a different practice context", () => {
    expect(
      shouldReuseExistingSession({
        existingStatus: "pending",
        existingContextId: "ctx-a",
        requestContextId: "ctx-b",
      }),
    ).toBe(false);
  });

  it("reuses pending with the same context", () => {
    expect(
      shouldReuseExistingSession({
        existingStatus: "pending",
        existingContextId: "ctx-a",
        requestContextId: "ctx-a",
      }),
    ).toBe(true);
  });

  it("does not reuse an expired pending session", () => {
    expect(
      shouldReuseExistingSession({
        existingStatus: "pending",
        existingContextId: "ctx-a",
        requestContextId: "ctx-a",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    ).toBe(false);
  });
});
