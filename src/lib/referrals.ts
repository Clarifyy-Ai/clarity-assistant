import { profilesDB, referralsDB } from "@/lib/supabase/database";
import { recordReferralViaEdge } from "@/lib/api/payments";

const REF_CODE_PATTERN = /^[A-Z0-9]{6,16}$/;

export function normalizeRefCode(raw: string | null | undefined): string | null {
  const upper = (raw ?? "").toUpperCase().trim();
  return REF_CODE_PATTERN.test(upper) ? upper : null;
}

export function getStoredRefCode(): string | null {
  return normalizeRefCode(localStorage.getItem("clarify_ref"));
}

export function clearStoredRefCode(): void {
  localStorage.removeItem("clarify_ref");
}

export async function recordReferral(userId: string, codeRaw: string | null | undefined): Promise<void> {
  const code = normalizeRefCode(codeRaw) ?? getStoredRefCode();
  if (!code) return;

  try {
    clearStoredRefCode();
    const result = await recordReferralViaEdge(code);
    if (!result.success || result.result?.ok === false) {
      const referrerId = await profilesDB.getIdByReferralCode(code);
      if (!referrerId || referrerId === userId) return;
      await referralsDB.upsertReferred({
        referrerId,
        referredId: userId,
        referredEmail: "",
      });
    }
  } catch (e) {
    console.warn("[referrals] Recording error:", e);
  }
}
