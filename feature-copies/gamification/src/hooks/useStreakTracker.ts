import { useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useGamificationStore } from "@/hooks/useGamification";
import { useAuthStore } from "@/store/authStore";

export function useStreakTracker() {
  const { user } = useAuthStore();
  const gamification = useGamificationStore();

  useEffect(() => {
    if (!user) return;
    checkAndHydrate();
  }, [user?.id]);

  async function checkAndHydrate(): Promise<void> {
    const { data } = await supabase
      .from("profiles")
      .select("streak_days, longest_streak, last_active_date, xp")
      .eq("id", user!.id)
      .maybeSingle();

    if (!data) return;

    gamification.setStreak(data.streak_days ?? 0, data.longest_streak ?? 0, data.last_active_date ?? null);
    gamification.setXP(data.xp ?? 0);
  }

  const recordActivity = useCallback(async (): Promise<void> => {
    if (!user) return;

    const { data, error } = await supabase.rpc("record_practice_activity" as any, {
      p_user_id: user.id,
    });

    if (!error && data) {
      const d = data as any;
      gamification.setStreak(d.streak_current, d.streak_longest, d.last_activity ?? null);
    }
  }, [user, gamification]);

  return {
    streak:        gamification.streak_current,
    longestStreak: gamification.streak_longest,
    recordActivity,
  };
}
