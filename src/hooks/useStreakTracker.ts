import { useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useGamificationStore } from "@/hooks/useGamification";
import { useAuthStore } from "@/store/userStore";

// ─────────────────────────────────────────────────────────────────
// useStreakTracker
// Checks and updates the daily practice streak on session complete.
// ─────────────────────────────────────────────────────────────────

export function useStreakTracker() {
  const { user }     = useAuthStore();
  const gamification = useGamificationStore();

  // ── Check streak on mount (once per day) ──────────────────────

  useEffect(() => {
    if (!user) return;
    checkAndHydrate();
  }, [user?.id]);

  async function checkAndHydrate(): Promise<void> {
    const { data } = await supabase
      .from("profiles")
      .select("streak_current, streak_longest, last_practice_date, xp_total")
      .eq("id", user!.id)
      .single();

    if (!data) return;

    gamification.setStreak(data.streak_current ?? 0, data.streak_longest ?? 0);
    gamification.setXP(data.xp_total ?? 0);
  }

  // ── Record practice activity (call after session complete) ────

  const recordActivity = useCallback(async (): Promise<void> => {
    if (!user) return;

    const { data, error } = await supabase.rpc("record_practice_activity", {
      p_user_id: user.id,
    });

    if (!error && data) {
      gamification.setStreak(data.streak_current, data.streak_longest);

      // Check if streak broke (reset to 1)
      if (data.streak_broken) {
        gamification.setStreakBroken(true);
      }
    }
  }, [user, gamification]);

  return {
    streak:        gamification.streakCurrent,
    longestStreak: gamification.streakLongest,
    recordActivity,
  };
}
