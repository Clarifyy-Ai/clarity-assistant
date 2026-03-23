import { supabase } from "@/lib/supabase/client";

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
    const { data: referrerProfiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("referral_code", code)
      .limit(1);

    clearStoredRefCode();

    if (!referrerProfiles || referrerProfiles.length === 0) return;
    const referrerId = referrerProfiles[0].id;
    if (referrerId === userId) return;

    const { error } = await supabase.from("referrals").upsert(
      {
        referrer_id:     referrerId,
        referred_id:     userId,
        referred_email:  "",
        credits_awarded: 0,
      },
      { onConflict: "referred_id" as any, ignoreDuplicates: true }
    );

    if (error) console.warn("[referrals] Insert failed:", error.message);
  } catch (e) {
    console.warn("[referrals] Recording error:", e);
  }
}
