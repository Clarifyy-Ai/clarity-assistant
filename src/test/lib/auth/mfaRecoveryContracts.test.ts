import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("MFA recovery source contracts", () => {
  const login = read("src/pages/auth/Login.tsx");
  const verifyEmail = read("src/pages/auth/VerifyEmail.tsx");
  const protectedRoute = read("src/components/layout/ProtectedRoute.tsx");
  const securityModel = read("src/lib/auth/securityModel.ts");
  const edge = read("supabase/functions/mfa-recovery/index.ts");
  const migration = read("supabase/migrations/20260903140000_mfa_recovery.sql");
  const guard = read("supabase/migrations/20260903150000_mfa_reenrollment_column_guard.sql");
  const config = read("supabase/config.toml");
  const fetchEdge = read("src/lib/network/fetchEdge.ts");

  it("keeps email OTP distinct from TOTP MFA", () => {
    expect(securityModel).toContain("Email OTP / magic link NEVER satisfies this factor");
    expect(securityModel).toContain("export function emailOtpSatisfiesMfa(): false");
    expect(verifyEmail).toContain("emailOtpSatisfiesMfa");
    expect(verifyEmail).toContain("it is not two-factor MFA");
    expect(verifyEmail).toContain("verifyOtp");
    expect(login).not.toMatch(/verifyOtp\([\s\S]*type:\s*["']email["']/);
  });

  it("offers lost-device recovery without skipping TOTP re-enrollment", () => {
    expect(login).toContain("I don&apos;t have my old device");
    expect(login).toContain("consumeMfaRecoveryCode");
    expect(login).toContain("startMfaEmailRecovery");
    expect(login).toContain("This does not skip two-factor authentication");
    expect(protectedRoute).toContain('authState: "recovery_required"');
    expect(protectedRoute).toContain("mfa_reenrollment_required");
  });

  it("requires AAL2 to issue recovery codes and never logs secrets", () => {
    expect(edge).toContain("AAL2_REQUIRED");
    expect(edge).toContain("action === \"issue_codes\"");
    expect(edge).toContain("action === \"consume_code\"");
    expect(edge).not.toContain("console.log");
    expect(edge).toContain("delete safe.code");
    expect(edge).toContain("delete safe.token");
    expect(edge).not.toMatch(/emailOtpSatisfiesMfa\(\)\s*===?\s*true/);
  });

  it("stores only hashed recovery secrets and revokes client table access", () => {
    expect(migration).toContain("mfa_recovery_codes");
    expect(migration).toContain("code_hash");
    expect(migration).toContain("REVOKE ALL ON public.mfa_recovery_codes FROM anon, authenticated");
    expect(guard).toContain("protect_mfa_reenrollment_required");
    expect(guard).toContain("mfa_recovery_codes_deny_client");
  });

  it("spot-checks MFA secret tables and server-managed reenrollment via RLS script", () => {
    const spot = read("scripts/rls-spot-check.mjs");
    expect(spot).toContain("mfa_recovery_codes");
    expect(spot).toContain("mfa_recovery_code_sets");
    expect(spot).toContain("mfa_recovery_tokens");
    expect(spot).toContain("mfa_security_events");
    expect(spot).toContain("mfa_reenrollment_required");
    expect(spot).toContain("isEmptyOrDenied");
  });


  it("registers the recovery Edge function as JWT-private", () => {
    expect(config).toContain("[functions.mfa-recovery]");
    expect(fetchEdge).toContain('"mfa-recovery"');
  });
});
