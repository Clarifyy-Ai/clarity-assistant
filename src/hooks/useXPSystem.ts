// src/hooks/useXPSystem.ts
import { useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useGamificationStore } from "@/hooks/useGamification";
import { useAuthStore } from "@/store/userStore";
import { BADGE_DEFINITIONS, XP_LEVELS } from "@/types/gamification.types";
import type { XPEventType, BadgeId } from "@/types/gamification.types";

// ─────────────────────────────────────────────────────────────────
// XP awarded per action (source of truth — referenced by both hooks)
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
// Pure function — no side effects — so it can be tested in isolation.
// Takes the full context after an XP grant and returns every badge
// that should now be unlocked (caller is responsible for deduplication
// against already-unlocked badges).
// ─────────────────────────────────────────────────────────────────

interface BadgeCheckParams {
  xp:       number;
  level:    number;
  prevLevel: number;   // level before this XP grant
  sessions: number;
  streak:   number;
  action:   XPEventType;
}

function checkBadgeUnlocks(params: BadgeCheckParams): BadgeId[] {
  const unlocked: BadgeId[] = [];

  // ── Session-count milestones ──────────────────────────────────
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

  // ── Streak milestones ─────────────────────────────────────────
  const streakMilestones: Array<[number, BadgeId]> = [
    [7,  "streak_7"],
    [14, "streak_14"],
    [30, "streak_30"],
    [60, "streak_60"],
  ];
  for (const [days, badge] of streakMilestones) {
    if (params.streak >= days) unlocked.push(badge);
  }

  // ── Level-up badges ───────────────────────────────────────────
  // Only award for levels crossed in THIS grant (prevLevel → level).
  // Iterating the range prevents missing a badge when a single large
  // XP grant crosses multiple level thresholds at once.
  if (params.level > params.prevLevel) {
    for (let lvl = params.prevLevel + 1; lvl <= params.level; lvl++) {
      // Badges baked into the XP_LEVELS definition (e.g. badge_id field)
      const levelDef = XP_LEVELS.find((l) => l.level === lvl);
      if (levelDef?.badge_id) {
        unlocked.push(levelDef.badge_id as BadgeId);
      }
      // Explicit level → badge map (supplements the XP_LEVELS definition)
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

  // ── Action-specific badges ────────────────────────────────────
  if (params.action === "zero_filler_session") unlocked.push("zero_filler");
  if (params.action === "perfect_score")       unlocked.push("perfect_score");
  if (params.action === "resume_uploaded")     unlocked.push("resume_uploaded");
  if (params.action === "referral_converted")  unlocked.push("referral_converted");

  return unlocked;
}

// ─────────────────────────────────────────────────────────────────
// useXPSystem hook
// Lightweight alternative to useGamification for components that
// only need to fire XP events without the full gamification state.
// Uses the same Zustand store so state stays in sync.
// ─────────────────────────────────────────────────────────────────

export function useXPSystem() {
  const { user }     = useAuthStore();
  const gamification = useGamificationStore();

  // ── Award XP, persist to DB, check badge unlocks ─────────────

  const awardXP = useCallback(async (action: XPEventType): Promise<void> => {
    if (!user) return;

    const amount = XP_REWARDS[action] ?? 0;
    if (!amount) return;

    const prevLevel = gamification.level;

    // Optimistic local update — keeps UI responsive
    gamification.addXP(amount);

    // Persist to DB via RPC (returns server-authoritative totals)
    const { data, error } = await supabase.rpc("award_xp", {
      p_user_id: user.id,
      p_action:  action,
      p_amount:  amount,
    });

    if (error) {
      // Roll back optimistic update on failure
      gamification.addXP(-amount);
      console.error("[useXPSystem] award_xp RPC failed:", error.message);
      return;
    }

    if (data) {
      // Sync with server-authoritative total (prevents drift)
      gamification.setXP(data.new_total);

      // ── Badge unlock check ────────────────────────────────────
      const newLevel  = gamification.level; // re-read after setXP
      const toUnlock  = checkBadgeUnlocks({
        xp:       data.new_total,
        level:    newLevel,
        prevLevel,
        sessions: data.total_sessions ?? 0,
        streak:   gamification.streak_current,
        action,
      });

      for (const badgeId of toUnlock) {
        // Skip already-unlocked badges (deduplication)
        if (gamification.unlocked_badges.includes(badgeId)) continue;

        // Optimistic local unlock + toast trigger
        gamification.unlockBadge(badgeId);
        gamification.setPendingBadge(badgeId);

        // Persist to DB
        const { error: badgeErr } = await supabase
          .from("user_badges")
          .insert({
            user_id:     user.id,
            badge_id:    badgeId,
            unlocked_at: new Date().toISOString(),
          });

        if (badgeErr) {
          // Badge insert failed — roll back local unlock to stay consistent
          console.error("[useXPSystem] Badge insert failed:", badgeErr.message);
          // Note: we don't roll back the store badge here because duplicate
          // inserts are harmless and the badge was earned — just log it.
        }

        // Award any XP bonus defined on the badge definition
        const bonus = BADGE_DEFINITIONS[badgeId]?.xp_bonus ?? 0;
        if (bonus > 0) {
          gamification.addXP(bonus);
          // Persist the bonus XP too (fire-and-forget, non-blocking)
          supabase.rpc("award_xp", {
            p_user_id: user.id,
            p_action:  "badge_bonus" as XPEventType,
            p_amount:  bonus,
          }).catch((err: Error) => {
            console.warn("[useXPSystem] badge bonus persist failed:", err.message);
          });
        }

        // Clear pending badge after the animation window
        setTimeout(() => {
          if (useGamificationStore.getState().pending_badge_unlock === badgeId) {
            gamification.setPendingBadge(null);
          }
        }, 4000);
      }
    }
  }, [user, gamification]);

  return {
    awardXP,
    xp:      gamification.xp,
    level:   gamification.level,
    rewards: XP_REWARDS,
  };
}
