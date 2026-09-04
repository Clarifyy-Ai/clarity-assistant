import { describe, expect, it } from "vitest";
import {
  indiaUserAfterProfileLookup,
  PROFILE_LOOKUP_TIMEOUT_MS,
  resolveIsIndiaProfile,
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

  it("allows gov exam access worldwide for any successful profile", () => {
    expect(
      resolveIsIndiaProfile({
        region: "US",
        timezone: "America/New_York",
        locale: "en-US",
      }),
    ).toBe(true);
    expect(
      indiaUserAfterProfileLookup(
        { region: "US", timezone: "America/New_York", locale: "en-US" },
        "ok",
      ),
    ).toBe(true);
    expect(
      indiaUserAfterProfileLookup(
        { region: "IN", timezone: "Asia/Kolkata", locale: "en-IN" },
        "ok",
      ),
    ).toBe(true);
  });
});
