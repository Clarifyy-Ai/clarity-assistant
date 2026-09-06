import { describe, expect, it } from "vitest";
import {
  resolveShareScorecardAllowed,
  parsePrivacyPrefs,
} from "@/lib/privacy/privacyPrefs";

describe("resolveShareScorecardAllowed", () => {
  it("defaults to allowed when share_scorecard is missing", () => {
    expect(resolveShareScorecardAllowed({})).toBe(true);
    expect(resolveShareScorecardAllowed(null)).toBe(true);
  });

  it("reads boolean and string share_scorecard values", () => {
    expect(resolveShareScorecardAllowed({ share_scorecard: true })).toBe(true);
    expect(resolveShareScorecardAllowed({ share_scorecard: false })).toBe(false);
    expect(resolveShareScorecardAllowed({ share_scorecard: "true" })).toBe(true);
    expect(resolveShareScorecardAllowed({ share_scorecard: "false" })).toBe(false);
  });

  it("supports legacy allow_scorecard_sharing key", () => {
    expect(resolveShareScorecardAllowed({ allow_scorecard_sharing: true })).toBe(true);
    expect(resolveShareScorecardAllowed({ allow_scorecard_sharing: "false" })).toBe(false);
  });

  it("prefers share_scorecard over legacy key", () => {
    expect(
      parsePrivacyPrefs({
        share_scorecard: true,
        allow_scorecard_sharing: false,
      }).share_scorecard,
    ).toBe(true);
  });
});
