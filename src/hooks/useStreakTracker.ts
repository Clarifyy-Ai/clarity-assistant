import { useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useGamificationStore } from "@/hooks/useGamification";
import { useAuthStore } from "@/store/userStore";

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
      .select("streak_current, streak_longest, streak_last_activity_date, xp")
      .eq("id", user!.id)
      .single();

    if (!data) return;

    gamification.setStreak(data.streak_current ?? 0, data.streak_longest ?? 0, data.streak_last_activity_date ?? null);
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
