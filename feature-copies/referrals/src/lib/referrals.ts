import { recordReferralViaEdge } from "@/lib/api/payments";
import { logger } from "@/lib/logger";

export const REFERRAL_STORAGE_KEY = "clarify_ref";
export const REF_CODE_PATTERN = /^[A-Z0-9]{6,16}$/;

const TERMINAL_REFERRAL_REASONS = new Set([
  "already_recorded",
  "self_referral",
  "code_not_found",
  "invalid_code",
]);

export type RecordReferralOutcome = {
  applied: boolean;
  alreadyRecorded: boolean;
  refereeCredits?: number;
  promoCode?: string;
};

export function normalizeRefCode(raw: string | null | undefined): string | null {
  const upper = (raw ?? "").toUpperCase().trim();
  return REF_CODE_PATTERN.test(upper) ? upper : null;
}

export function getStoredRefCode(): string | null {
  try {
    return normalizeRefCode(localStorage.getItem(REFERRAL_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function storeRefCode(raw: string | null | undefined): string | null {
  const code = normalizeRefCode(raw);
  if (!code) return null;
  try {
    localStorage.setItem(REFERRAL_STORAGE_KEY, code);
  } catch {
    // Storage can be blocked (private mode / quota). Claim still works via ?ref= on onboarding.
  }
  return code;
}

export function clearStoredRefCode(): void {
  try {
    localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Clear stored code after a successful HTTP response that will not succeed on retry. */
export function shouldClearStoredReferral(result: {
  success: boolean;
  result?: { ok?: boolean; reason?: string };
}): boolean {
  if (!result.success) return false;
  if (result.result?.ok !== false) return true;
  const reason = result.result?.reason;
  return typeof reason === "string" && TERMINAL_REFERRAL_REASONS.has(reason);
}

/**
 * Record a stored or explicit referral code via the edge function (service-role RPC).
 * Does not write `profiles.referred_by` or `referrals` from the client (RLS-pinned / fraud-prone).
 * Keeps localStorage on network failure so the next authenticated load can retry.
 */
export async function recordReferral(
  userId: string,
  codeRaw: string | null | undefined,
): Promise<RecordReferralOutcome> {
  const empty: RecordReferralOutcome = { applied: false, alreadyRecorded: false };
  if (!userId) return empty;

  const code = normalizeRefCode(codeRaw) ?? getStoredRefCode();
  if (!code) return empty;

  try {
    const result = await recordReferralViaEdge(code);
    if (shouldClearStoredReferral(result)) {
      clearStoredRefCode();
    }
    if (result.result?.ok === true && result.result.reason === "already_recorded") {
      return { applied: false, alreadyRecorded: true };
    }
    if (result.success && result.result?.ok !== false) {
      return {
        applied: true,
        alreadyRecorded: false,
        refereeCredits: result.result?.referee_credits,
        promoCode: result.result?.promo_code,
      };
    }
    return empty;
  } catch (e) {
    logger.warn("referral.record.failed", {
      operation: "referral.record",
      outcome: "failed",
      retryable: true,
      error: e instanceof Error ? e.message : "unknown",
    });
    return empty;
  }
}
