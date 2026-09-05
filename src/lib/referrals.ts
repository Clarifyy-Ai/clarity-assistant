import { recordReferralViaEdge, validateReferralViaEdge } from "@/lib/api/payments";
import { PUBLIC_WEBSITE_URL } from "@/lib/constants/contact";
import { logger } from "@/lib/logger";
import { supabase } from "@/lib/supabase/client";

export const REFERRAL_STORAGE_KEY = "clarify_ref";
export const REFERRAL_SESSION_STORAGE_KEY = "clarify_ref_session";
export const PENDING_REFERRAL_METADATA_KEY = "pending_referral_code";
export const REF_CODE_PATTERN = /^[A-Z0-9]{6,16}$/;

const TERMINAL_REFERRAL_REASONS = new Set([
  "already_recorded",
  "self_referral",
  "code_not_found",
  "invalid_code",
  "programme_disabled",
]);

export type RecordReferralOutcome = {
  applied: boolean;
  alreadyRecorded: boolean;
  refereeCredits?: number;
  promoCode?: string;
  /** Edge/RPC reason when claim did not apply. */
  reason?: string;
  /** True when a later attempt may succeed (network/auth timing). */
  retryable?: boolean;
};

/** Read ?ref= or legacy ?r= from URL search params. */
export function extractRefCodeFromSearchParams(
  params: URLSearchParams | { get: (key: string) => string | null },
): string | null {
  return (
    normalizeRefCode(params.get("ref")) ?? normalizeRefCode(params.get("r"))
  );
}

export function normalizeRefCode(raw: string | null | undefined): string | null {
  const upper = (raw ?? "").toUpperCase().trim();
  return REF_CODE_PATTERN.test(upper) ? upper : null;
}

/** Read pending referral from Auth user_metadata (set at signup before verify). */
export function getPendingReferralFromUserMetadata(
  user: { user_metadata?: Record<string, unknown> | null } | null | undefined,
): string | null {
  const meta = user?.user_metadata;
  if (!meta || typeof meta !== "object") return null;
  return normalizeRefCode(
    typeof meta[PENDING_REFERRAL_METADATA_KEY] === "string"
      ? (meta[PENDING_REFERRAL_METADATA_KEY] as string)
      : null,
  );
}

/**
 * Resolve referral code for claim: explicit arg → Auth metadata → localStorage.
 * Metadata survives verify/logout of assistive storage.
 */
export function resolveReferralCodeForClaim(
  explicit: string | null | undefined,
  user?: { user_metadata?: Record<string, unknown> | null } | null,
): string | null {
  return (
    normalizeRefCode(explicit) ??
    getPendingReferralFromUserMetadata(user) ??
    getStoredRefCode()
  );
}

export function getStoredRefCode(): string | null {
  try {
    return (
      normalizeRefCode(localStorage.getItem(REFERRAL_STORAGE_KEY)) ??
      normalizeRefCode(sessionStorage.getItem(REFERRAL_SESSION_STORAGE_KEY))
    );
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
  try {
    sessionStorage.setItem(REFERRAL_SESSION_STORAGE_KEY, code);
  } catch {
    // sessionStorage may be blocked; localStorage/metadata remain primary.
  }
  return code;
}

export function clearStoredRefCode(): void {
  try {
    localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem(REFERRAL_SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function emptyReferralOutcome(
  extra: Partial<RecordReferralOutcome> = {},
): RecordReferralOutcome {
  return { applied: false, alreadyRecorded: false, ...extra };
}

function isTerminalReferralReason(reason: string | undefined): boolean {
  return typeof reason === "string" && TERMINAL_REFERRAL_REASONS.has(reason);
}

/** Public signup URL with attribution query for sharing. */
export function buildReferralLink(code: string): string {
  return `${PUBLIC_WEBSITE_URL}/signup?ref=${code}`;
}

/** Neutral banner copy — reward is not confirmed until server claim succeeds. */
export function referralCodeSavedMessage(code: string): string {
  return `Referral code ${code} saved — bonus credits apply after email verification.`;
}

export type ValidateReferralOutcome = {
  valid: boolean;
  programmeVersion: string | null;
  code: string;
};

/** Public validation — no PII; optional debounce on signup forms. */
export async function validateReferralCode(
  codeRaw: string,
): Promise<ValidateReferralOutcome> {
  const code = normalizeRefCode(codeRaw);
  if (!code) {
    return { valid: false, programmeVersion: null, code: "REFERRAL_CODE_INVALID" };
  }
  try {
    const result = await validateReferralViaEdge(code);
    return {
      valid: Boolean(result.valid),
      programmeVersion: result.programmeVersion ?? null,
      code: result.code ?? (result.valid ? "OK" : "REFERRAL_CODE_INVALID"),
    };
  } catch (e) {
    logger.warn("referral.validate.failed", {
      error: e instanceof Error ? e.message : "unknown",
    });
    return { valid: false, programmeVersion: null, code: "VALIDATION_UNAVAILABLE" };
  }
}

/**
 * Persist assistive referral code to Auth user_metadata (survives OAuth redirect).
 * Explicit URL codes may update metadata; storage alone never overrides existing metadata.
 */
export async function persistPendingReferralToAuthMetadata(
  user: { user_metadata?: Record<string, unknown> | null } | null | undefined,
  explicitCode?: string | null,
): Promise<string | null> {
  const resolved = resolveReferralCodeForClaim(explicitCode, user);
  if (!resolved) {
    return getPendingReferralFromUserMetadata(user);
  }

  const existing = getPendingReferralFromUserMetadata(user);
  if (existing === resolved) return resolved;

  const explicit = normalizeRefCode(explicitCode);
  if (existing && !explicit) return existing;

  try {
    const { error } = await supabase.auth.updateUser({
      data: { [PENDING_REFERRAL_METADATA_KEY]: resolved },
    });
    if (error) {
      logger.warn("referral.metadata.persist.failed", {
        error: error.message,
        hasExplicit: Boolean(explicit),
      });
      return resolved;
    }
    return resolved;
  } catch (e) {
    logger.warn("referral.metadata.persist.failed", {
      error: e instanceof Error ? e.message : "unknown",
    });
    return resolved;
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
 * Prefers Auth user_metadata.pending_referral_code (set at signup) over localStorage.
 * Keeps localStorage on network failure so the next authenticated load can retry.
 */
export async function recordReferral(
  userId: string,
  codeRaw: string | null | undefined,
  user?: { user_metadata?: Record<string, unknown> | null } | null,
): Promise<RecordReferralOutcome> {
  if (!userId) return emptyReferralOutcome();

  const code = resolveReferralCodeForClaim(codeRaw, user);
  if (!code) return emptyReferralOutcome();

  try {
    const result = await recordReferralViaEdge(code);
    if (shouldClearStoredReferral(result)) {
      clearStoredRefCode();
    }
    if (result.result?.ok === true && result.result.reason === "already_recorded") {
      return emptyReferralOutcome({
        alreadyRecorded: true,
        reason: "already_recorded",
        retryable: false,
      });
    }
    if (result.success && result.result?.ok !== false) {
      return {
        applied: true,
        alreadyRecorded: false,
        retryable: false,
        refereeCredits: result.result?.referee_credits,
        promoCode: result.result?.promo_code,
      };
    }

    const reason =
      result.result?.reason ??
      (result.success ? "unknown" : "transport_failure");
    return emptyReferralOutcome({
      reason,
      retryable: !isTerminalReferralReason(reason),
    });
  } catch (e) {
    logger.warn("referral.record.failed", {
      operation: "referral.record",
      outcome: "failed",
      retryable: true,
      error: e instanceof Error ? e.message : "unknown",
    });
    return emptyReferralOutcome({
      reason: "network_error",
      retryable: true,
    });
  }
}
