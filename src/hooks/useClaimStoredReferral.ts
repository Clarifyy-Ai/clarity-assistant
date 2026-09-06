import { useEffect } from "react";
import { toast } from "sonner";
import {
  getPendingReferralFromUserMetadata,
  getStoredRefCode,
  recordReferral,
  resolveReferralCodeForClaim,
} from "@/lib/referrals";
import { refreshCreditsFromStore } from "@/lib/billing/creditPrecheck";
import { isUserEmailConfirmed } from "@/lib/auth/emailVerification";
import { logger } from "@/lib/logger";
import { useAuthStore } from "@/store/authStore";

const MAX_CLAIM_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [0, 2_000, 5_000, 10_000, 30_000] as const;

const TERMINAL_CLAIM_MESSAGES: Record<string, string> = {
  self_referral: "You can't use your own referral code.",
  code_not_found: "That referral code isn't valid.",
  invalid_code: "That referral code isn't valid.",
  programme_disabled: "Referrals are paused right now.",
  already_recorded: "",
};

function terminalClaimMessage(reason: string | undefined): string | null {
  if (!reason || reason === "already_recorded") return null;
  return (
    TERMINAL_CLAIM_MESSAGES[reason] ??
    "We couldn't apply your referral. Sign in again or contact support if this persists."
  );
}

/**
 * After login, claim a referral code from Auth user_metadata (signup) or
 * assistive storage (?ref=). Retries transient failures per attribution policy.
 */
export function useClaimStoredReferral(userId: string | undefined): void {
  const status = useAuthStore((s) => s.status);
  const isProfileLoaded = useAuthStore((s) => s.isProfileLoaded);
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const pendingFromMeta = useAuthStore((s) =>
    getPendingReferralFromUserMetadata(s.user),
  );

  useEffect(() => {
    if (!userId || status !== "authenticated" || !isProfileLoaded) return;
    if (!isUserEmailConfirmed(user)) return;
    if (profile?.referred_by) return;

    const pendingCode = resolveReferralCodeForClaim(null, user);
    if (!pendingCode) return;

    let cancelled = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = (fn: () => void) => {
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
      retryTimer = setTimeout(fn, delay);
    };

    const runClaim = async (): Promise<void> => {
      if (cancelled) return;

      const currentUser = useAuthStore.getState().user;
      const currentProfile = useAuthStore.getState().profile;
      if (currentProfile?.referred_by) return;

      const code = resolveReferralCodeForClaim(null, currentUser);
      if (!code) return;

      const outcome = await recordReferral(userId, null, currentUser);
      if (cancelled) return;

      if (outcome.applied) {
        await refreshCreditsFromStore().catch(() => undefined);
        await Promise.resolve(
          useAuthStore.getState().loadProfile?.({ force: true }),
        ).catch(() => undefined);
        if (outcome.refereeCredits) {
          toast.success(
            `Referral applied — ${outcome.refereeCredits} bonus credits added to your account.`,
          );
        }
        return;
      }

      if (outcome.alreadyRecorded) return;

      if (outcome.retryable && attempt < MAX_CLAIM_ATTEMPTS - 1) {
        attempt += 1;
        logger.warn("referral.claim.retry", {
          attempt,
          reason: outcome.reason ?? "unknown",
          hasMetadata: Boolean(getPendingReferralFromUserMetadata(currentUser)),
          hasStorage: Boolean(getStoredRefCode()),
        });
        scheduleRetry(() => {
          void runClaim();
        });
        return;
      }

      if (outcome.reason) {
        logger.warn("referral.claim.failed", {
          reason: outcome.reason,
          retryable: outcome.retryable ?? false,
          attempts: attempt + 1,
        });
      }

      const message = terminalClaimMessage(outcome.reason);
      if (message) {
        toast.error(message);
      } else if (outcome.retryable) {
        toast.error(
          "We couldn't apply your referral after several tries. It will retry next time you sign in.",
        );
      }
    };

    void runClaim();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [userId, status, isProfileLoaded, user, profile?.referred_by, pendingFromMeta]);
}
