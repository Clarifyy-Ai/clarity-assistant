import { describe, expect, it } from "vitest";
import { normalizeSessionLifecycle } from "@/lib/session/sessionLifecycleContract";

describe("sessionLifecycleContract", () => {
  it("normalizes lifecycle fields from DB-shaped rows", () => {
    const normalized = normalizeSessionLifecycle({
      id: "sess-1",
      status: "active",
      lifecycle_status: "active",
      started_at: "2026-01-01T00:00:00.000Z",
    });
    expect(normalized?.id).toBe("sess-1");
    expect(normalized?.lifecycleStatus).toBe("active");
    expect(normalized?.isTerminal).toBe(false);
  });

  it("marks ended sessions terminal", () => {
    const normalized = normalizeSessionLifecycle({
      id: "sess-2",
      lifecycle_status: "ended",
      ended_at: "2026-01-01T01:00:00.000Z",
    });
    expect(normalized?.isTerminal).toBe(true);
  });

  it("returns null for empty input", () => {
    expect(normalizeSessionLifecycle(null)).toBeNull();
    expect(normalizeSessionLifecycle({})).toBeNull();
  });
});
