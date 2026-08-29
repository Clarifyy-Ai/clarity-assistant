import { describe, expect, it } from "vitest";
import {
  omitPinnedProfileColumns,
  pinnedProfileColumnsIn,
  PROFILE_CLIENT_PINNED_COLUMNS,
} from "@/lib/profile/clientUpdateGuard";

describe("client profile update guard", () => {
  it("strips pinned entitlement and gamification columns", () => {
    const next = omitPinnedProfileColumns({
      full_name: "Ada",
      credits: 9999,
      plan_id: "enterprise",
      is_banned: true,
      referred_by: "ABC123",
      referral_code: "MINE",
      xp: 500,
      total_sessions: 12,
      target_role: "swe",
    });
    expect(next).toEqual({ full_name: "Ada", target_role: "swe" });
    expect("credits" in next).toBe(false);
    expect("xp" in next).toBe(false);
  });

  it("reports which pinned keys a client tried to send", () => {
    expect(pinnedProfileColumnsIn({ full_name: "Ada", credits: 1, xp: 2 })).toEqual([
      "credits",
      "xp",
    ]);
    expect(PROFILE_CLIENT_PINNED_COLUMNS).toContain("plan_id");
    expect(PROFILE_CLIENT_PINNED_COLUMNS).toContain("referred_by");
    expect(PROFILE_CLIENT_PINNED_COLUMNS).toContain("onboarding_completed");
    expect(PROFILE_CLIENT_PINNED_COLUMNS).toContain("onboarding_step");
  });
});
