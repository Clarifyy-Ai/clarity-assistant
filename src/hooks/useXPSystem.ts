// src/hooks/useXPSystem.ts
import { useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useGamificationStore } from "@/hooks/useGamification";
import { useAuthStore } from "@/store/userStore";
import { BADGE_DEFINITIONS, XP_LEVELS } from "@/types/gamification.types";
import type { XPEventType, BadgeId } from "@/types/gamification.types";

// ─────────────────────────────────────────────────────────────────
// XP awarded per action (source of truth)
// ─────────────────────────────────────────────────────────────────

export const XP_REWARDS: Record<XPEventType, number> = {
  mock_session_complete:     50,
  live_session_complete:     40,
  prep_lab_use:              10,
  debrief_complete:          20,
  first_session:             100,
  streak_milestone:          25,
  weekly_challenge_complete: 75,
  answer_saved:              5,
  resume_uploaded:           15,
  zero_filler_session:       30,
  perfect_score:             50,
  room_session_complete:     45,
  referral_converted:        60,
};

// ─────────────────────────────────────────────────────────────────
// Badge unlock evaluation
// ─────────────────────────────────────────────────────────────────

interface BadgeCheckParams {
  xp:       number;
  level:    number;
  prevLevel: number;
  sessions: number;
  streak:   number;
  action:   XPEventType;
}

function checkBadgeUnlocks(params: BadgeCheckParams): BadgeId[] {
  const unlocked: BadgeId[] = [];

  const sessionMilestones: Array<[number, BadgeId]> = [
    [1,   "first_session"],
    [10,  "ten_sessions"],
    [25,  "twenty_five_sessions"],
    [50,  "fifty_sessions"],
    [100, "hundred_sessions"],
  ];
  for (const [count, badge] of sessionMilestones) {
    if (params.sessions >= count) unlocked.push(badge);
  }

  const streakMilestones: Array<[number, BadgeId]> = [
    [7,  "streak_7"],
    [14, "streak_14"],
    [30, "streak_30"],
    [60, "streak_60"],
  ];
  for (const [days, badge] of streakMilestones) {
    if (params.streak >= days) unlocked.push(badge);
  }

  if (params.level > params.prevLevel) {
    for (let lvl = params.prevLevel + 1; lvl <= params.level; lvl++) {
      const levelDef = XP_LEVELS.find((l) => l.level === lvl);
      if (levelDef?.badge_id) {
        unlocked.push(levelDef.badge_id as BadgeId);
      }
      const LEVEL_BADGES: Partial<Record<number, BadgeId>> = {
        5:  "level_5",
        10: "level_10",
        20: "level_20",
        50: "level_50",
      };
      const levelBadge = LEVEL_BADGES[lvl];
      if (levelBadge) unlocked.push(levelBadge);
    }
  }

  if (params.action === "zero_filler_session") unlocked.push("zero_filler");
  if (params.action === "perfect_score")       unlocked.push("perfect_score");
  if (params.action === "resume_uploaded")     unlocked.push("resume_uploaded");
  if (params.action === "referral_converted")  unlocked.push("referral_converted");

  return unlocked;
}

// ─────────────────────────────────────────────────────────────────
// useXPSystem hook
// ─────────────────────────────────────────────────────────────────

export function useXPSystem() {
  const { user }     = useAuthStore();
  const gamification = useGamificationStore();

  const awardXP = useCallback(async (action: XPEventType): Promise<void> => {
    if (!user) return;

    const amount = XP_REWARDS[action] ?? 0;
    if (!amount) return;

    const prevLevel = gamification.level;

    // Optimistic local update
    gamification.addXP(amount);

    // Persist to DB via direct profile update (no RPC needed)
    const { data: profileData, error } = await supabase
      .from("profiles")
      .select("xp, total_sessions")
      .eq("id", user.id)
      .single();

    if (error || !profileData) {
      gamification.addXP(-amount);
      console.error("[useXPSystem] XP fetch failed:", error?.message);
      return;
    }

    const newTotal = (profileData.xp ?? 0) + amount;

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ xp: newTotal, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (updateErr) {
      gamification.addXP(-amount);
      console.error("[useXPSystem] XP update failed:", updateErr.message);
      return;
    }

    // Sync with server-authoritative total
    gamification.setXP(newTotal);

    // Badge unlock check
    const newLevel  = gamification.level;
    const toUnlock  = checkBadgeUnlocks({
      xp:       newTotal,
      level:    newLevel,
      prevLevel,
      sessions: profileData.total_sessions ?? 0,
      streak:   gamification.streak_current,
      action,
    });

    for (const badgeId of toUnlock) {
      if (gamification.unlocked_badges.includes(badgeId)) continue;

      gamification.unlockBadge(badgeId);
      gamification.setPendingBadge(badgeId);

      // Persist badge to DB (fire-and-forget)
      supabase
        .from("user_badges" as any)
        .insert({
          user_id:     user.id,
          badge_id:    badgeId,
          unlocked_at: new Date().toISOString(),
        } as any)
        .then(({ error: badgeErr }) => {
          if (badgeErr) {
            console.error("[useXPSystem] Badge insert failed:", badgeErr.message);
          }
        });

      // Award any XP bonus defined on the badge definition
      const bonus = BADGE_DEFINITIONS[badgeId]?.xp_bonus ?? 0;
      if (bonus > 0) {
        gamification.addXP(bonus);
        // Persist the bonus XP too (fire-and-forget)
        supabase
          .from("profiles")
          .update({ xp: newTotal + bonus })
          .eq("id", user.id)
          .then(({ error: bonusErr }) => {
            if (bonusErr) {
              console.warn("[useXPSystem] badge bonus persist failed:", bonusErr.message);
            }
          });
      }

      // Clear pending badge after animation window
      setTimeout(() => {
        if (useGamificationStore.getState().pending_badge_unlock === badgeId) {
          gamification.setPendingBadge(null);
        }
      }, 4000);
    }
  }, [user, gamification]);

  return {
    awardXP,
    xp:      gamification.xp,
    level:   gamification.level,
    rewards: XP_REWARDS,
  };
}
