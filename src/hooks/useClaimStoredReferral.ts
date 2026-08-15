import { useEffect } from "react";
import { toast } from "sonner";
import { recordReferral } from "@/lib/referrals";
import { refreshCredits } from "@/lib/billing/creditsManager";

/**
 * After login, claim a ?ref= code stored at signup/OAuth.
 * Kept out of authStore to avoid a cycle (authStore → payments → invokeFunction → authStore).
 */
export function useClaimStoredReferral(userId: string | undefined): void {
  useEffect(() => {
    if (!userId) return;
    void recordReferral(userId, null).then(async (outcome) => {
      if (!outcome.applied) return;
      await refreshCredits().catch(() => undefined);
      if (outcome.refereeCredits) {
        toast.success(
          `Referral applied — ${outcome.refereeCredits} bonus credits added to your account.`,
        );
      }
    });
  }, [userId]);
}
