import { describe, expect, it } from "vitest";
import { ROUTES } from "@/lib/constants/apiEndpoints";
import {
  CANONICAL_DEBRIEFS,
  LEGACY_DEBRIEF,
  ONBOARDING_COMPLETION_PATH,
  RETIRED_ROOMS_PATH,
  RETIRED_ROOMS_REDIRECT,
  debriefCanonicalPath,
  debriefLegacyRedirect,
} from "@/lib/routes/canonical";

describe("canonical product routes", () => {
  it("sends onboarding completion to Dashboard, not live session", () => {
    expect(ONBOARDING_COMPLETION_PATH).toBe("/app/dashboard");
    expect(ONBOARDING_COMPLETION_PATH).toBe(ROUTES.DASHBOARD);
    expect(ONBOARDING_COMPLETION_PATH).not.toBe(ROUTES.LIVE_SESSION);
  });

  it("uses plural debriefs as canonical and maps singular legacy IDs", () => {
    expect(CANONICAL_DEBRIEFS).toBe("/app/debriefs");
    expect(ROUTES.DEBRIEFS).toBe("/app/debriefs");
    expect(debriefCanonicalPath("abc")).toBe("/app/debriefs/abc");
    expect(debriefLegacyRedirect("abc")).toBe("/app/debriefs/abc");
    expect(LEGACY_DEBRIEF).toBe("/app/debrief");
    expect(LEGACY_DEBRIEF).not.toBe(CANONICAL_DEBRIEFS);
  });

  it("retires Practice Rooms to Dashboard", () => {
    expect(RETIRED_ROOMS_PATH).toBe("/app/rooms");
    expect(RETIRED_ROOMS_REDIRECT).toBe(ROUTES.DASHBOARD);
  });
});
