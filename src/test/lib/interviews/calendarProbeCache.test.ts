import { describe, expect, it } from "vitest";

function isCalendarUnavailableError(err: { status?: number; code?: string; message?: string }): boolean {
  if (err.status === 501 || err.code === "NOT_CONFIGURED") return true;
  const msg = (err.message ?? "").toLowerCase();
  return (
    msg.includes("501") ||
    msg.includes("not available") ||
    msg.includes("not configured") ||
    msg.includes("coming soon")
  );
}

function shouldCacheProbeFailure(err: { status?: number; code?: string; message?: string }): boolean {
  if (err.status === 401 || err.status === 403) return false;
  return isCalendarUnavailableError(err);
}

describe("calendar probe cache", () => {
  it("does not cache unauthenticated probe failures", () => {
    expect(shouldCacheProbeFailure({ status: 401 })).toBe(false);
    expect(shouldCacheProbeFailure({ status: 403 })).toBe(false);
  });

  it("caches definitive NOT_CONFIGURED responses", () => {
    expect(shouldCacheProbeFailure({ status: 501, code: "NOT_CONFIGURED" })).toBe(true);
  });
});
