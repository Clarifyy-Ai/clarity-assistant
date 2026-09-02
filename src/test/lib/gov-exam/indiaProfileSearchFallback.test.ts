import { describe, expect, it } from "vitest";
import {
  indiaUserAfterProfileLookup,
  PROFILE_LOOKUP_TIMEOUT_MS,
} from "../../../../supabase/functions/_shared/indiaRegion";

describe("search profile lookup fallback", () => {
  it("exposes a bounded profile lookup budget", () => {
    expect(PROFILE_LOOKUP_TIMEOUT_MS).toBeLessThanOrEqual(3_000);
    expect(PROFILE_LOOKUP_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it("fails open to India on timeout so search is not blocked", () => {
    expect(
      indiaUserAfterProfileLookup(
        { region: "US", timezone: "America/New_York", locale: "en-US" },
        "timed_out",
      ),
    ).toBe(true);
    expect(indiaUserAfterProfileLookup(null, "failed")).toBe(true);
  });

  it("still honours a successful non-India profile", () => {
    expect(
      indiaUserAfterProfileLookup(
        { region: "US", timezone: "America/New_York", locale: "en-US" },
        "ok",
      ),
    ).toBe(false);
    expect(
      indiaUserAfterProfileLookup(
        { region: "IN", timezone: "Asia/Kolkata", locale: "en-IN" },
        "ok",
      ),
    ).toBe(true);
  });
});
