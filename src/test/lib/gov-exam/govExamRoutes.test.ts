import { describe, expect, it } from "vitest";
import {
  canBrowseGovExamsBeforeProfileReady,
  canBrowseGovExamsDuringAccountRecovery,
} from "@/lib/gov-exam/govExamRoutes";

describe("gov exam bootstrap gates", () => {
  it("lets authenticated users browse generate while profile is still loading", () => {
    expect(
      canBrowseGovExamsBeforeProfileReady({
        pathname: "/app/mock-test/generate",
        status: "authenticated",
        accountPhase: "ACCOUNT_LOADING",
        hasUser: true,
        mfaBlocked: false,
      }),
    ).toBe(true);
  });

  it("keeps the generation route mounted after a recoverable profile timeout", () => {
    expect(
      canBrowseGovExamsDuringAccountRecovery({
        pathname: "/app/mock-test/generate",
        status: "error",
        hasUser: true,
        mfaBlocked: false,
      }),
    ).toBe(true);
    expect(
      canBrowseGovExamsBeforeProfileReady({
        pathname: "/app/mock-test/generate",
        status: "error",
        accountPhase: "RECOVERY_REQUIRED",
        hasUser: true,
        mfaBlocked: false,
      }),
    ).toBe(true);
  });

  it("does not bypass login or MFA", () => {
    expect(
      canBrowseGovExamsDuringAccountRecovery({
        pathname: "/app/mock-test/generate",
        status: "unauthenticated",
        hasUser: false,
        mfaBlocked: false,
      }),
    ).toBe(false);
    expect(
      canBrowseGovExamsBeforeProfileReady({
        pathname: "/app/dashboard",
        status: "authenticated",
        hasUser: true,
        mfaBlocked: false,
      }),
    ).toBe(false);
  });
});
