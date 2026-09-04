import { describe, expect, it } from "vitest";
import { CALENDAR_OAUTH_DENIED_MESSAGE } from "@/pages/app/settings/SettingsIntegrations";

describe("Google Calendar OAuth denied UX", () => {
  it("explains Testing / Test user / verification block (not only cancel)", () => {
    expect(CALENDAR_OAUTH_DENIED_MESSAGE).toMatch(/Test user/i);
    expect(CALENDAR_OAUTH_DENIED_MESSAGE).toMatch(/Access blocked|verification|Testing/i);
    expect(CALENDAR_OAUTH_DENIED_MESSAGE).not.toMatch(/^Google Calendar permission was not granted\.?$/);
  });
});
