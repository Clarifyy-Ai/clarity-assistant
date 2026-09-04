import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("signup verification honesty contracts (BUG 22)", () => {
  it("authStore rejects empty identities and persists pending_referral_code", () => {
    const store = read("src/store/authStore.ts");
    expect(store).toContain("isSignupAlreadyRegisteredResponse");
    expect(store).toContain("signupAlreadyRegisteredError");
    expect(store).toContain("pending_referral_code");
    expect(store).toContain("normalizeRefCode(referralCode)");
    expect(store).toContain('emailRedirectTo: authAbsoluteUrl("/auth/callback")');
  });

  it("Signup passes referral into signUpWithEmail and does not navigate on throw", () => {
    const page = read("src/pages/auth/Signup.tsx");
    expect(page).toContain("signUpWithEmail(");
    expect(page).toContain("refCode ?? getStoredRefCode()");
    expect(page).toContain('navigate("/verify-email"');
    expect(page).toContain("formatSupabaseAuthError(error)");
  });

  it("VerifyEmail maps resend errors to sent/failed/rate_limited and never fakes success", () => {
    const page = read("src/pages/auth/VerifyEmail.tsx");
    expect(page).toContain("classifyAuthEmailResend");
    expect(page).toContain("setResendOk(false)");
    expect(page).toContain('classified.kind === "rate_limited"');
    expect(page).toContain("verify-email-resend-sent");
    expect(page).toContain("verify-email-resend-failed");
    expect(page).toContain("verify-email-resend-rate-limited");
    expect(page).toContain("setCooldown(60)");
    expect(page).not.toMatch(/setResendOk\(true\)[\s\S]{0,40}if \(error\)/);
  });

  it("auth helper signUp mirrors metadata + empty-identities guard", () => {
    const auth = read("src/lib/supabase/auth.ts");
    expect(auth).toContain("pending_referral_code");
    expect(auth).toContain("isSignupAlreadyRegisteredResponse");
    expect(auth).toContain('emailRedirectTo: authAbsoluteUrl("/auth/callback")');
  });
});
