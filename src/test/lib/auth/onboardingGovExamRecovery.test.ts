import { describe, expect, it } from "vitest";
import { stepFromPopState, onboardingHistoryState } from "@/lib/onboarding/history";
import {
  canBrowseGovExamsBeforeProfileReady,
  canBrowseGovExamsDuringAccountRecovery,
} from "@/lib/gov-exam/govExamRoutes";
import { isOAuthNotConfiguredError } from "@/lib/auth/oauthProviders";

describe("onboarding popstate", () => {
  it("restores the step stored on the history entry", () => {
    expect(stepFromPopState(onboardingHistoryState(1), 2)).toBe(1);
    expect(stepFromPopState(onboardingHistoryState(2), 1)).toBe(2);
  });

  it("steps back when history state is missing", () => {
    expect(stepFromPopState(null, 2)).toBe(1);
    expect(stepFromPopState({}, 1)).toBe(1);
  });
});

describe("gov exam bootstrap recovery", () => {
  it("allows browse while profile is still loading", () => {
    expect(
      canBrowseGovExamsBeforeProfileReady({
        pathname: "/app/mock-test",
        status: "authenticated",
        hasUser: true,
        mfaBlocked: false,
      }),
    ).toBe(true);
  });

  it("allows browse after profile recovery failure", () => {
    expect(
      canBrowseGovExamsDuringAccountRecovery({
        pathname: "/app/mock-test/upsc",
        status: "error",
        hasUser: true,
        mfaBlocked: false,
      }),
    ).toBe(true);
  });

  it("does not bypass MFA or unauthenticated users", () => {
    expect(
      canBrowseGovExamsDuringAccountRecovery({
        pathname: "/app/mock-test",
        status: "error",
        hasUser: true,
        mfaBlocked: true,
      }),
    ).toBe(false);
    expect(
      canBrowseGovExamsDuringAccountRecovery({
        pathname: "/app/mock-test",
        status: "unauthenticated",
        hasUser: false,
        mfaBlocked: false,
      }),
    ).toBe(false);
  });
});

describe("OAuth not configured", () => {
  it("detects provider-disabled callback errors", () => {
    expect(
      isOAuthNotConfiguredError("server_error", "Unsupported provider: provider is not enabled"),
    ).toBe(true);
    expect(isOAuthNotConfiguredError("access_denied")).toBe(false);
  });
});
