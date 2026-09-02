import { supabase } from "@/lib/supabase/client";
import {
  evaluateMfaAssurance,
  type AuthenticatorAssuranceSnapshot,
} from "@/hooks/useAuth";
import { collectMfaFactors, findVerifiedTotp } from "@/lib/auth/mfaFactors";

/**
 * Fail-closed MFA at login and ProtectedRoute. Keep false in production.
 * Settings enrollment UI is independent of this flag.
 */
export const MFA_ENFORCEMENT_PAUSED = false;

export type MfaGateDecision = "allow" | "challenge" | "block";

export type MfaGateResult = {
  decision: MfaGateDecision;
  factorId?: string;
};

async function resolveVerifiedTotpFactorId(): Promise<string | undefined> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return undefined;
  return findVerifiedTotp(collectMfaFactors(data))?.id;
}

/** Resolve MFA gate from an existing AAL snapshot (e.g. Login after password). */
export async function resolveMfaGateFromAal(input: {
  error?: unknown;
  aal?: AuthenticatorAssuranceSnapshot;
}): Promise<MfaGateResult> {
  if (MFA_ENFORCEMENT_PAUSED) return { decision: "allow" };

  const assurance = evaluateMfaAssurance(input);
  if (assurance === "fail_closed") return { decision: "block" };

  if (assurance === "challenge") {
    const factorId = await resolveVerifiedTotpFactorId();
    if (!factorId) return { decision: "block" };
    return { decision: "challenge", factorId };
  }

  // AAL may under-report MFA requirement — cross-check verified factors.
  if (input.aal?.currentLevel === "aal1") {
    const factorId = await resolveVerifiedTotpFactorId();
    if (factorId) return { decision: "challenge", factorId };
  }

  return { decision: "allow" };
}

/** Fetch AAL and resolve MFA gate (ProtectedRoute, session refresh paths). */
export async function resolveMfaGateDecision(): Promise<MfaGateResult> {
  if (MFA_ENFORCEMENT_PAUSED) return { decision: "allow" };

  const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return resolveMfaGateFromAal({ error, aal });
}
