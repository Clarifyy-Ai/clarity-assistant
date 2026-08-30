import { describe, expect, it } from "vitest";
import { shouldSignOutAfterRefreshAttempt } from "@/components/layout/SessionTimeoutBanner";

describe("shouldSignOutAfterRefreshAttempt", () => {
  it("does not sign out when a refresh returns a new session", () => {
    expect(
      shouldSignOutAfterRefreshAttempt({
        expired: false,
        session: { access_token: "new" },
        probeFailed: false,
      }),
    ).toBe(false);
  });

  it("does not sign out on a transient probe failure", () => {
    expect(
      shouldSignOutAfterRefreshAttempt({
        expired: false,
        session: null,
        probeFailed: true,
      }),
    ).toBe(false);
  });

  it("signs out only when the refresh token is actually dead", () => {
    expect(
      shouldSignOutAfterRefreshAttempt({
        expired: true,
        session: null,
        probeFailed: false,
      }),
    ).toBe(true);
  });
});
