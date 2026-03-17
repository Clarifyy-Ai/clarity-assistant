import { useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useGamificationStore } from "@/hooks/useGamification";
import { useAuthStore } from "@/store/userStore";
import { BADGE_DEFINITIONS, checkBadgeUnlock } from "@/lib/gamification/badgeEngine";
import type { XPAction } from "@/types/gamification.types";

// ─────────────────────────────────────────────────────────────────
// XP awarded per action
// ─────────────────────────────────────────────────────────────────

export const XP_REWARDS: Record<XPAction, number> = {
  mock_session_complete:   50,
  live_session_complete:   40,
  scorecard_viewed:        10,
  star_answer_saved:        5,
  debrief_submitted:       20,
  prep_tool_used:           5,
  perfect_session:         25,   // bonus: 0 fillers
  streak_7_days:           30,
  streak_30_days:          100,
  first_session:           20,
  score_above_70:          15,
  score_above_85:          25,
};

export function useXPSystem() {
  const { user }     = useAuthStore();
  const gamification = useGamificationStore();

  // ── Award XP and check badge unlocks ─────────────────────────

  const awardXP = useCallback(async (action: XPAction): Promise<void> => {
    if (!user) return;

    const amount = XP_REWARDS[action] ?? 0;
    if (!amount) return;

    // Optimistic local update
    const newXP = gamification.xp + amount;
    gamification.addXP(amount);

    // Persist to DB
    const { data, error } = await supabase.rpc("award_xp", {
      p_user_id: user.id,
      p_action:  action,
      p_amount:  amount,
    });

    if (error) {
      // Rollback optimistic update
      gamification.addXP(-amount);
      return;
    }

    if (data) {
      gamification.setXP(data.new_total);
      gamification.setLevel(data.new_level, data.level_label);

      // Check badge unlocks
      const unlocked = checkBadgeUnlock({
        xp:       data.new_total,
        level:    data.new_level,
        sessions: data.total_sessions,
        streak:   gamification.streakCurrent,
        action,
      });

      for (const badgeId of unlocked) {
        if (!gamification.unlockedBadges.includes(badgeId)) {
          gamification.unlockBadge(badgeId);
          gamification.setPendingBadge(badgeId);

          // Persist badge unlock
          await supabase.from("user_badges").insert({
            user_id:     user.id,
            badge_id:    badgeId,
            unlocked_at: new Date().toISOString(),
          });
        }
      }
    }
  }, [user, gamification]);

  return {
    awardXP,
    xp:       gamification.xp,
    level:    gamification.level,
    rewards:  XP_REWARDS,
  };
}
