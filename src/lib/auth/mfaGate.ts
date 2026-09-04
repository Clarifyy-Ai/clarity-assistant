import { supabase } from "@/lib/supabase/client";
import {
  evaluateMfaAssurance,
  type AuthenticatorAssuranceSnapshot,
} from "@/hooks/useAuth";
import { collectMfaFactors, findVerifiedTotp } from "@/lib/auth/mfaFactors";

/**
 * Dev-only diagnostic. Production builds always force false so flipping this
 * cannot open the MFA gate in shipped clients. Do not wire to a VITE_* env.
 * Settings enrollment UI is independent of this flag.
 */
const MFA_ENFORCEMENT_PAUSED_DEV = false;

export const MFA_ENFORCEMENT_PAUSED: boolean = import.meta.env.PROD
  ? false
  : MFA_ENFORCEMENT_PAUSED_DEV;

/** Fail-closed: production paths never honor a pause, even if the export is true. */
export function isMfaEnforcementPaused(): boolean {
  if (import.meta.env.PROD) return false;
  return MFA_ENFORCEMENT_PAUSED;
}

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
  if (isMfaEnforcementPaused()) return { decision: "allow" };

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
  if (isMfaEnforcementPaused()) return { decision: "allow" };

  const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return resolveMfaGateFromAal({ error, aal });
}
