import { useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useGamificationStore } from "@/hooks/useGamification";
import { useAuthStore } from "@/store/authStore";

export function useStreakTracker() {
  const { user } = useAuthStore();
  const gamification = useGamificationStore();

  const checkAndHydrate = useCallback(async (): Promise<void> => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("streak_days, longest_streak, last_active_date, xp")
      .eq("id", user.id)
      .maybeSingle();

    if (!data) return;

    gamification.setStreak(data.streak_days ?? 0, data.longest_streak ?? 0, data.last_active_date ?? null);
    gamification.setXP(data.xp ?? 0);
  }, [user?.id, gamification.setStreak, gamification.setXP]);

  useEffect(() => {
    if (!user) return;

    void checkAndHydrate();

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void checkAndHydrate();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    const channel = supabase
      .channel(`dashboard-streak:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        () => void checkAndHydrate(),
      )
      .subscribe();

    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [user?.id, checkAndHydrate]);

  const recordActivity = useCallback(async (): Promise<void> => {
    if (!user) return;

    const { data, error } = await supabase.rpc("record_practice_activity", {
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
    refresh:       checkAndHydrate,
    recordActivity,
  };
}
