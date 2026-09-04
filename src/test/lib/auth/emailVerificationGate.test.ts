import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isUserEmailConfirmed } from "@/lib/auth/emailVerification";
import { getAuthenticatedEntryPath } from "@/lib/auth/postAuthRedirect";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("isUserEmailConfirmed", () => {
  it("requires a non-empty timestamp", () => {
    expect(isUserEmailConfirmed({ email_confirmed_at: "2026-01-01T00:00:00Z" })).toBe(
      true,
    );
    expect(isUserEmailConfirmed({ email_confirmed_at: null })).toBe(false);
    expect(isUserEmailConfirmed({ email_confirmed_at: "" })).toBe(false);
    expect(isUserEmailConfirmed(null)).toBe(false);
  });
});

describe("getAuthenticatedEntryPath", () => {
  it("routes verified users to onboarding before dashboard", () => {
    expect(getAuthenticatedEntryPath({ isAdmin: false, isOnboarded: false })).toBe(
      "/onboarding",
    );
    expect(getAuthenticatedEntryPath({ isAdmin: false, isOnboarded: true })).toBe(
      "/app/dashboard",
    );
    expect(getAuthenticatedEntryPath({ isAdmin: true, isOnboarded: false })).toBe(
      "/app/admin",
    );
  });

  it("prefers sanitized returnTo for onboarded users", () => {
    expect(
      getAuthenticatedEntryPath({
        isAdmin: false,
        isOnboarded: true,
        preferredReturnTo: "/app/mock-test/generate?examId=x",
      }),
    ).toBe("/app/mock-test/generate?examId=x");
    expect(
      getAuthenticatedEntryPath({
        isAdmin: false,
        isOnboarded: false,
        preferredReturnTo: "/app/mock-test",
      }),
    ).toBe("/onboarding?returnTo=%2Fapp%2Fmock-test");
    expect(
      getAuthenticatedEntryPath({
        isAdmin: false,
        isOnboarded: true,
        preferredReturnTo: "https://evil.example/phish",
      }),
    ).toBe("/app/dashboard");
  });
});

describe("getPostOnboardingPath", () => {
  it("honors returnTo after onboarding completes", async () => {
    const { getPostOnboardingPath } = await import("@/lib/auth/postAuthRedirect");
    expect(getPostOnboardingPath("/app/mock-test/session/abc")).toBe(
      "/app/mock-test/session/abc",
    );
    expect(getPostOnboardingPath(null)).toBe("/app/dashboard");
  });
});

describe("signup verification gate contracts (BUG-017)", () => {
  const authStore = read("src/store/authStore.ts");
  const protectedRoute = read("src/components/layout/ProtectedRoute.tsx");
  const utilsAuth = read("supabase/functions/_shared/utils.ts");
  const sharedAuth = read("supabase/functions/_shared/auth.ts");
  const migration = read(
    "supabase/migrations/20260902120000_email_verification_server_gate.sql",
  );

  it("revokes local session when signup returns an unverified user", () => {
    expect(authStore).toContain("isUserEmailConfirmed(data.user)");
    expect(authStore).toContain('signOut({ scope: "local" })');
  });

  it("does not hydrate authenticated state for unverified sessions", () => {
    expect(authStore).toContain("!isUserEmailConfirmed(session.user)");
  });

  it("revokes local session when password login returns an unverified user", () => {
    expect(authStore).toContain("!isUserEmailConfirmed(data.user)");
    expect(authStore).toMatch(
      /signInWithEmail[\s\S]*signOut\(\{ scope: "local" \}\)/,
    );
  });

  it("always redirects unverified users away from protected routes", () => {
    expect(protectedRoute).toContain("if (!isUserEmailConfirmed(user))");
    expect(protectedRoute).not.toMatch(
      /requireEmailVerification && !isUserEmailConfirmed/,
    );
    expect(protectedRoute).not.toContain("requireEmailVerification");
    expect(protectedRoute).toContain("pathWithReturnTo(\"/verify-email\"");
  });

  it("enforces email verification in edge requireAuth helpers", () => {
    expect(utilsAuth).toContain("EMAIL_NOT_VERIFIED");
    expect(utilsAuth).toContain("isAuthUserEmailConfirmed");
    expect(sharedAuth).toContain("EmailNotVerifiedError");
    expect(sharedAuth).toContain("emailNotVerifiedResponse");
  });

  it("blocks complete_onboarding for unverified accounts", () => {
    expect(migration).toContain("is_auth_email_verified");
    expect(migration).toContain("EMAIL_NOT_VERIFIED");
  });
});

describe("edge emailVerification helper", () => {
  it("matches client confirmation semantics", async () => {
    const mod = await import(
      "../../../../supabase/functions/_shared/emailVerification.ts"
    );
    expect(mod.isAuthUserEmailConfirmed({ email_confirmed_at: "x" })).toBe(true);
    expect(mod.isAuthUserEmailConfirmed({ email_confirmed_at: null })).toBe(false);
  });
});
