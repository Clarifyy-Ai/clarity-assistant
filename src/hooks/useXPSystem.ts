// @ts-nocheck
import { useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useGamificationStore } from "@/hooks/useGamification";
import { useAuthStore } from "@/store/userStore";
import { BADGE_DEFINITIONS } from "@/types/gamification.types";
import type { XPEventType, BadgeId } from "@/types/gamification.types";

// ─────────────────────────────────────────────────────────────────
// XP awarded per action
// ─────────────────────────────────────────────────────────────────

export const XP_REWARDS: Record<XPEventType, number> = {
  mock_session_complete:       50,
  live_session_complete:       40,
  prep_lab_use:                10,
  debrief_complete:            20,
  first_session:               100,
  streak_milestone:            25,
  weekly_challenge_complete:   75,
  answer_saved:                5,
  resume_uploaded:             15,
  zero_filler_session:         30,
  perfect_score:               50,
  room_session_complete:       45,
  referral_converted:          60,
};

export function useXPSystem() {
  const { user }     = useAuthStore();
  const gamification = useGamificationStore();

  // ── Award XP and check badge unlocks ─────────────────────────

  const awardXP = useCallback(async (action: XPEventType): Promise<void> => {
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

      // Check badge unlocks
      const unlocked = checkBadgeUnlock({
        xp:       data.new_total,
        level:    gamification.level,
        sessions: data.total_sessions,
        streak:   gamification.streak_current,
        action,
      });

      for (const badgeId of unlocked) {
        if (!gamification.unlocked_badges.includes(badgeId)) {
          gamification.unlockBadge(badgeId);
          gamification.setPendingBadge(badgeId);

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

// Simple badge unlock checker
function checkBadgeUnlock(params: {
  xp: number;
  level: number;
  sessions: number;
  streak: number;
  action: XPEventType;
}): BadgeId[] {
  const unlocked: BadgeId[] = [];
  if (params.sessions >= 1)   unlocked.push("first_session");
  if (params.sessions >= 10)  unlocked.push("ten_sessions");
  if (params.sessions >= 25)  unlocked.push("twenty_five_sessions");
  if (params.streak >= 7)     unlocked.push("streak_7");
  if (params.streak >= 14)    unlocked.push("streak_14");
  if (params.streak >= 30)    unlocked.push("streak_30");
  if (params.action === "zero_filler_session") unlocked.push("zero_filler");
  if (params.action === "perfect_score")       unlocked.push("perfect_score");
  return unlocked;
}
