import { useEffect } from "react";
import {
  startFocusRecoveryCoordinator,
  subscribeFocusRecovery,
} from "@/lib/focusRecovery";
import { useAuthStore, getProfileCacheAgeMs } from "@/store/authStore";
import { getActiveChannelNames } from "@/lib/supabase/realtime";

/**
 * Registers the process-wide focus/visibility recovery coordinator once.
 * Individual screens subscribe for stale revalidation; they must not attach
 * their own visibility/focus/pageshow listeners for data refresh.
 */
export function useFocusRecoveryCoordinator(): void {
  useEffect(() => {
    startFocusRecoveryCoordinator(() => {
      const auth = useAuthStore.getState();
      const expiresAt =
        typeof auth.session?.expires_at === "number"
          ? auth.session.expires_at * 1000
          : null;
      return {
        status: auth.status,
        hasValidProfile: Boolean(auth.isProfileLoaded && auth.profile),
        profileAgeMs: getProfileCacheAgeMs(),
        roleResolved: auth.isAdminResolved,
        sessionExpiresAtMs: expiresAt,
      };
    });

    const unsubscribe = subscribeFocusRecovery(async (plan) => {
      if (plan.revalidate.includes("profile") || plan.revalidate.includes("role")) {
        await useAuthStore.getState().loadProfile({ background: true });
      } else if (plan.revalidate.includes("credits")) {
        await useAuthStore.getState().refreshCredits();
      }
    });

    if (typeof window !== "undefined") {
      (
        window as unknown as {
          __clarifyRealtime?: { getActiveChannelNames: () => string[] };
        }
      ).__clarifyRealtime = { getActiveChannelNames };
    }

    // Keep process-wide browser listeners for the app lifetime. Unsubscribing
    // the React-owned data listener is enough; detaching here races Strict Mode.
    return () => {
      unsubscribe();
    };
  }, []);
}
