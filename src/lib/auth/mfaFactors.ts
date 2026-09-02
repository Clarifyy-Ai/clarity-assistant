/**
 * Supabase MFA factor helpers.
 * Unverified TOTP rows (abandoned enroll) keep friendly names reserved and
 * block re-enroll with 422 while login correctly skips MFA until verified.
 */
import type { AuthMFAListFactorsResponse, Factor } from "@supabase/supabase-js";

export const MFA_TOTP_FRIENDLY_NAME = "Authenticator app";

export type ListedMfaFactor = Pick<
  Factor,
  "id" | "friendly_name" | "factor_type" | "status"
>;

/** Prefer `all` so unverified enrollments are visible to the UI. */
export function collectMfaFactors(
  data: AuthMFAListFactorsResponse["data"] | null | undefined,
): ListedMfaFactor[] {
  if (!data) return [];
  const fromAll = Array.isArray(data.all) ? data.all : [];
  if (fromAll.length > 0) {
    return fromAll.map((f) => ({
      id: f.id,
      friendly_name: f.friendly_name ?? undefined,
      factor_type: f.factor_type,
      status: f.status,
    }));
  }
  return [...(data.totp ?? []), ...(data.phone ?? [])].map((f) => ({
    id: f.id,
    friendly_name: f.friendly_name ?? undefined,
    factor_type: f.factor_type,
    status: f.status,
  }));
}

export function findVerifiedTotp(factors: ListedMfaFactor[]): ListedMfaFactor | undefined {
  return factors.find((f) => f.factor_type === "totp" && f.status === "verified");
}

export function findUnverifiedTotp(factors: ListedMfaFactor[]): ListedMfaFactor[] {
  return factors.filter((f) => f.factor_type === "totp" && f.status === "unverified");
}

export function isFriendlyNameConflictError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("friendly name") ||
    m.includes("already exists") ||
    m.includes("factor with the friendly name")
  );
}

export type MfaChallengeClient = {
  challenge: (args: { factorId: string }) => Promise<{
    data: { id?: string } | null;
    error: { message?: string } | null;
  }>;
  verify: (args: {
    factorId: string;
    challengeId: string;
    code: string;
  }) => Promise<{ error: { message?: string } | null }>;
};

export async function verifyTotpChallenge(
  mfa: MfaChallengeClient,
  input: { factorId: string; code: string },
): Promise<void> {
  const code = input.code.replace(/\D/g, "").trim();
  if (code.length < 6) {
    throw new Error("Enter the 6-digit code from your authenticator app.");
  }

  const { data: challenge, error: challengeError } = await mfa.challenge({
    factorId: input.factorId,
  });
  if (challengeError) throw challengeError;

  const challengeId = challenge?.id?.trim();
  if (!challengeId) {
    throw new Error("We couldn't start two-factor verification. Sign in again.");
  }

  const { error: verifyError } = await mfa.verify({
    factorId: input.factorId,
    challengeId,
    code,
  });
  if (verifyError) throw verifyError;
}
