// @ts-nocheck
import { useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import {
  XP_LEVELS,
  XP_REWARDS,
  BADGE_DEFINITIONS,
} from "@/types/gamification.types";
import type {
  XPEventType,
  BadgeId,
  GamificationState,
} from "@/types/gamification.types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─────────────────────────────────────────────────────────────────
// Gamification Store (inline — small enough to not need separate file)
// ─────────────────────────────────────────────────────────────────

interface GamificationStore extends GamificationState {
  setXP:                (xp: number) => void;
  addXP:                (amount: number) => void;
  setStreak:            (current: number, longest: number, lastActivity: string | null) => void;
  unlockBadge:          (id: BadgeId) => void;
  setPendingBadge:      (id: BadgeId | null) => void;
  setWeeklyChallenge:   (challenge: GamificationState["weekly_challenge"]) => void;
  resetGamification:    () => void;
}

const computeLevel = (xp: number) => {
  let level = 1;
  for (const threshold of XP_LEVELS) {
    if (xp >= threshold.xp_required) level = threshold.level;
    else break;
  }
  const current    = XP_LEVELS.find((l) => l.level === level)!;
  const next       = XP_LEVELS.find((l) => l.level === level + 1);
  const xpIntoLevel = xp - current.xp_required;
  const xpNeeded    = next ? next.xp_required - current.xp_required : 1;
  return {
    level,
    level_label:        current.label,
    xp_to_next_level:   next ? next.xp_required - xp : 0,
    xp_progress_percent: Math.min(100, Math.round((xpIntoLevel / xpNeeded) * 100)),
  };
};

export const useGamificationStore = create<GamificationStore>()(
  persist(
    (set) => ({
      xp: 0,
      level: 1,
      level_label: XP_LEVELS[0].label,
      xp_to_next_level: XP_LEVELS[1].xp_required,
      xp_progress_percent: 0,
      streak_current: 0,
      streak_longest: 0,
      streak_last_activity_date: null,
      unlocked_badges: [],
      recent_xp_events: [],
      weekly_challenge: null,
      pending_badge_unlock: null,

      setXP: (xp) => set({ xp, ...computeLevel(xp) }),

      addXP: (amount) =>
        set((s) => {
          const newXP = s.xp + amount;
          return { xp: newXP, ...computeLevel(newXP) };
        }),

      setStreak: (streak_current, streak_longest, streak_last_activity_date) =>
        set({ streak_current, streak_longest, streak_last_activity_date }),

      unlockBadge: (id) =>
        set((s) =>
          s.unlocked_badges.includes(id)
            ? {}
            : { unlocked_badges: [...s.unlocked_badges, id] }
        ),

      setPendingBadge: (pending_badge_unlock) => set({ pending_badge_unlock }),

      setWeeklyChallenge: (weekly_challenge) => set({ weekly_challenge }),

      resetGamification: () =>
        set({
          xp: 0, level: 1, level_label: XP_LEVELS[0].label,
          xp_to_next_level: XP_LEVELS[1].xp_required,
          xp_progress_percent: 0,
          streak_current: 0, streak_longest: 0,
          streak_last_activity_date: null, unlocked_badges: [],
          recent_xp_events: [], weekly_challenge: null,
          pending_badge_unlock: null,
        }),
    }),
    { name: "confideq-gamification" }
  )
);

// ─────────────────────────────────────────────────────────────────
// useGamification hook
// ─────────────────────────────────────────────────────────────────

export function useGamification() {
  const { user } = useAuthStore();
  const store     = useGamificationStore();

  // ── Load from DB on mount ─────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    loadGamificationData();
  }, [user?.id]);

  async function loadGamificationData(): Promise<void> {
    if (!user) return;

    const [profileRes, badgesRes, challengeRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("xp, streak_current, streak_longest, streak_last_activity_date")
        .eq("id", user.id)
        .single(),
      supabase
        .from("user_badges")
        .select("badge_id")
        .eq("user_id", user.id),
      supabase
        .from("weekly_challenges")
        .select("*")
        .eq("user_id", user.id)
        .gte("week_end", new Date().toISOString())
        .single(),
    ]);

    if (profileRes.data) {
      const p = profileRes.data;
      store.setXP(p.xp ?? 0);
      store.setStreak(
        p.streak_current ?? 0,
        p.streak_longest ?? 0,
        p.streak_last_activity_date ?? null
      );
    }

    if (badgesRes.data) {
      badgesRes.data.forEach((b) => store.unlockBadge(b.badge_id as BadgeId));
    }

    if (challengeRes.data) {
      store.setWeeklyChallenge(challengeRes.data as any);
    }
  }

  // ── Award XP ──────────────────────────────────────────────────

  const awardXP = useCallback(async (
    eventType: XPEventType,
    metadata: Record<string, unknown> = {}
  ): Promise<void> => {
    if (!user) return;

    const amount  = XP_REWARDS[eventType];
    const prevLevel = store.level;

    store.addXP(amount);

    // Persist to DB via Edge Function
    try {
      const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
      await fetch(`${EDGE_BASE}/award-xp`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ event_type: eventType, xp: amount, metadata }),
      });
    } catch { /* non-fatal */ }

    // Check for level-up badge
    const newLevel = useGamificationStore.getState().level;
    if (newLevel > prevLevel) {
      const levelDef = XP_LEVELS.find((l) => l.level === newLevel);
      if (levelDef?.badge_id) {
        await unlockBadge(levelDef.badge_id as BadgeId);
      }
    }
  }, [user, store.level]);

  // ── Unlock badge ──────────────────────────────────────────────

  const unlockBadge = useCallback(async (badgeId: BadgeId): Promise<void> => {
    if (!user) return;
    if (store.unlocked_badges.includes(badgeId)) return;

    store.unlockBadge(badgeId);
    store.setPendingBadge(badgeId);   // triggers toast animation

    // Persist badge + bonus XP
    try {
      const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
      await fetch(`${EDGE_BASE}/unlock-badge`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ badge_id: badgeId }),
      });
    } catch { /* non-fatal */ }

    // Award bonus XP from badge definition
    const bonus = BADGE_DEFINITIONS[badgeId]?.xp_bonus ?? 0;
    if (bonus > 0) store.addXP(bonus);

    // Clear pending after animation window
    setTimeout(() => store.setPendingBadge(null), 4000);
  }, [user, store.unlocked_badges]);

  // ── Check and award session badges ───────────────────────────

  const checkSessionBadges = useCallback(async (
    totalSessions: number
  ): Promise<void> => {
    const milestones: Array<[number, BadgeId]> = [
      [1,   "first_session"],
      [10,  "ten_sessions"],
      [25,  "twenty_five_sessions"],
      [50,  "fifty_sessions"],
      [100, "hundred_sessions"],
    ];
    for (const [count, badge] of milestones) {
      if (totalSessions >= count) await unlockBadge(badge);
    }
  }, [unlockBadge]);

  // ── Update streak ─────────────────────────────────────────────

  const updateStreak = useCallback(async (): Promise<void> => {
    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("streak_current, streak_longest, streak_last_activity_date")
      .eq("id", user.id)
      .single();

    if (!data) return;

    const lastActivity = data.streak_last_activity_date
      ? new Date(data.streak_last_activity_date)
      : null;
    const now          = new Date();
    const daysDiff     = lastActivity
      ? Math.floor((now.getTime() - lastActivity.getTime()) / 86_400_000)
      : null;

    let newStreak = data.streak_current ?? 0;
    if (daysDiff === null || daysDiff > 1) {
      newStreak = 1; // Reset or start
    } else if (daysDiff === 1) {
      newStreak += 1; // Continue streak
    }
    // daysDiff === 0 → same day, no change

    const newLongest = Math.max(newStreak, data.streak_longest ?? 0);

    store.setStreak(newStreak, newLongest, now.toISOString());

    // Streak milestone badges
    const streakBadges: Array<[number, BadgeId]> = [
      [7,  "streak_7"],
      [14, "streak_14"],
      [30, "streak_30"],
      [60, "streak_60"],
    ];
    for (const [days, badge] of streakBadges) {
      if (newStreak >= days) await unlockBadge(badge);
    }

    if (newStreak > 0 && newStreak % 7 === 0) {
      await awardXP("streak_milestone");
    }
  }, [user, awardXP, unlockBadge]);

  return {
    // State
    xp:                 store.xp,
    level:              store.level,
    levelLabel:         store.level_label,
    xpToNextLevel:      store.xp_to_next_level,
    xpProgressPercent:  store.xp_progress_percent,
    streakCurrent:      store.streak_current,
    streakLongest:      store.streak_longest,
    unlockedBadges:     store.unlocked_badges,
    weeklyChallenge:    store.weekly_challenge,
    pendingBadge:       store.pending_badge_unlock,

    // Actions
    awardXP,
    unlockBadge,
    checkSessionBadges,
    updateStreak,
    clearPendingBadge:  () => store.setPendingBadge(null),
  };
}
