import { describe, expect, it } from "vitest";
import {
  normalizeSessionDurationInput,
  type SessionDurationInput,
} from "@/lib/session/sessionDurationContract";

describe("normalizeSessionDurationInput", () => {
  it("accepts valid session objects with finite duration_seconds", () => {
    const input: SessionDurationInput = {
      duration_seconds: 125,
      started_at: "2026-01-01T00:00:00Z",
      ended_at: "2026-01-01T00:02:05Z",
    };
    expect(normalizeSessionDurationInput(input)).toEqual({
      duration_seconds: 125,
      started_at: input.started_at,
      ended_at: input.ended_at,
      status: null,
      lifecycle_status: null,
    });
  });

  it("rejects bare numbers and non-objects", () => {
    expect(normalizeSessionDurationInput(42)).toBeNull();
    expect(normalizeSessionDurationInput("120")).toBeNull();
    expect(normalizeSessionDurationInput(null)).toBeNull();
    expect(normalizeSessionDurationInput(undefined)).toBeNull();
  });

  it("rejects non-finite duration_seconds", () => {
    expect(
      normalizeSessionDurationInput({ duration_seconds: Number.NaN }),
    ).toBeNull();
    expect(
      normalizeSessionDurationInput({ duration_seconds: -5 }),
    ).toBeNull();
  });

  it("allows missing duration when started_at and ended_at are valid ISO strings", () => {
    const normalized = normalizeSessionDurationInput({
      started_at: "2026-01-01T00:00:00Z",
      ended_at: "2026-01-01T00:03:00Z",
    });
    expect(normalized?.started_at).toBe("2026-01-01T00:00:00Z");
    expect(normalized?.ended_at).toBe("2026-01-01T00:03:00Z");
    expect(normalized?.duration_seconds).toBeNull();
  });
});
