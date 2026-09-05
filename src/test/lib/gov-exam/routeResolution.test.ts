import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyGovExamLoadError,
  isTemporaryGovExamError,
  resolveGovExamAuthPhase,
} from "@/lib/gov-exam/routeResolution";
import { ApiClientError } from "@/lib/api/apiClient";
import { pathWithReturnTo } from "@/lib/auth/safeReturnTo";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("resolveGovExamAuthPhase", () => {
  it("never resolves to dashboard while auth is initializing", () => {
    expect(
      resolveGovExamAuthPhase({
        status: "loading",
        hasUser: false,
        emailVerified: false,
        onboardingComplete: false,
        profileLoaded: false,
        mfaBlocked: false,
        returnTo: "/app/mock-test/generate?examId=x",
      }),
    ).toEqual({ phase: "AUTH_INITIALIZING" });
  });

  it("preserves returnTo for onboarding gate", () => {
    expect(
      resolveGovExamAuthPhase({
        status: "authenticated",
        hasUser: true,
        emailVerified: true,
        onboardingComplete: false,
        profileLoaded: true,
        mfaBlocked: false,
        returnTo: "/app/mock-test/generate?jobId=abc",
      }),
    ).toEqual({
      phase: "ONBOARDING_REQUIRED",
      returnTo: "/app/mock-test/generate?jobId=abc",
    });
  });
});

describe("classifyGovExamLoadError", () => {
  it("treats 503 as temporary failure", () => {
    const res = classifyGovExamLoadError(
      new ApiClientError({ message: "Unavailable", code: "SERVICE_UNAVAILABLE", status: 503 }),
    );
    expect(res.phase).toBe("TEMPORARY_BACKEND_FAILURE");
    expect(res.retryable).toBe(true);
  });

  it("maps 404 to invalid identifier", () => {
    const res = classifyGovExamLoadError(
      new ApiClientError({ message: "Not found", code: "ATTEMPT_NOT_FOUND", status: 404 }),
    );
    expect(res.phase).toBe("INVALID_IDENTIFIER");
  });
});

describe("isTemporaryGovExamError", () => {
  it("includes rate limits", () => {
    expect(
      isTemporaryGovExamError(
        new ApiClientError({ message: "Slow down", code: "RATE_LIMITED", status: 429 }),
      ),
    ).toBe(true);
  });
});

describe("ProtectedRoute onboarding returnTo (source contract)", () => {
  it("embeds returnTo in onboarding redirect URL", () => {
    const src = read("src/components/layout/ProtectedRoute.tsx");
    expect(src).toContain('pathWithReturnTo("/onboarding", returnTo)');
    expect(src).toContain("pathWithReturnTo(AUTH_PATHS.mfaEnroll, returnTo)");
  });
});

describe("pathWithReturnTo onboarding deep link", () => {
  it("survives refresh for generate URL", () => {
    expect(pathWithReturnTo("/onboarding", "/app/mock-test/generate?jobId=1")).toBe(
      "/onboarding?returnTo=%2Fapp%2Fmock-test%2Fgenerate%3FjobId%3D1",
    );
  });
});
