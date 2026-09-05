import { describe, expect, it } from "vitest";
import {
  applyHide,
  applyReport,
  applyRestore,
  applyResolve,
  canPublicRead,
  isPublicCommunityStatus,
  moderationStatusBadgeVariant,
} from "@/lib/community/moderation";

describe("community moderation helpers", () => {
  it("transitions report and hide states", () => {
    expect(applyReport("PUBLISHED")).toBe("REPORTED");
    expect(applyReport("HIDDEN")).toBe("HIDDEN");
    expect(applyHide()).toBe("HIDDEN");
    expect(applyRestore()).toBe("PUBLISHED");
    expect(applyResolve()).toBe("RESOLVED");
  });

  it("controls public readability", () => {
    expect(canPublicRead("HIDDEN", false, false)).toBe(false);
    expect(canPublicRead("PUBLISHED", false, false)).toBe(true);
    expect(canPublicRead("HIDDEN", false, true)).toBe(true);
    expect(isPublicCommunityStatus("PUBLISHED")).toBe(true);
    expect(isPublicCommunityStatus("HIDDEN")).toBe(false);
  });

  it("maps badge variants", () => {
    expect(moderationStatusBadgeVariant("REPORTED")).toBe("amber");
    expect(moderationStatusBadgeVariant("HIDDEN")).toBe("red");
  });
});
