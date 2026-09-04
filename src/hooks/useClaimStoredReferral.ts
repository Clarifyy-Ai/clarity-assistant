import { useEffect } from "react";
import { toast } from "sonner";
import {
  getPendingReferralFromUserMetadata,
  recordReferral,
} from "@/lib/referrals";
import { refreshCredits } from "@/lib/billing/creditsManager";
import { useAuthStore } from "@/store/authStore";

/**
 * After login, claim a referral code from Auth user_metadata (signup) or
 * assistive localStorage (?ref=). Kept out of authStore to avoid a cycle.
 */
export function useClaimStoredReferral(userId: string | undefined): void {
  const pendingFromMeta = useAuthStore((s) =>
    getPendingReferralFromUserMetadata(s.user),
  );

  useEffect(() => {
    if (!userId) return;
    const user = useAuthStore.getState().user;
    void recordReferral(userId, null, user).then(async (outcome) => {
      if (!outcome.applied) return;
      await refreshCredits().catch(() => undefined);
      if (outcome.refereeCredits) {
        toast.success(
          `Referral applied — ${outcome.refereeCredits} bonus credits added to your account.`,
        );
      }
    });
  }, [userId, pendingFromMeta]);
}
