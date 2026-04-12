// src/hooks/useGamification.ts
import { fetchEdge } from "@/lib/network/fetchEdge";
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
// Gamification Store
// ─────────────────────────────────────────────────────────────────

interface GamificationStore extends GamificationState {
  setXP:              (xp: number) => void;
  addXP:              (amount: number) => void;
  setStreak:          (current: number, longest: number, lastActivity: string | null) => void;
  unlockBadge:        (id: BadgeId) => void;
  setPendingBadge:    (id: BadgeId | null) => void;
  setWeeklyChallenge: (challenge: GamificationState["weekly_challenge"]) => void;
  resetGamification:  () => void;
}

function computeLevel(xp: number): Pick<
  GamificationState,
  "level" | "level_label" | "xp_to_next_level" | "xp_progress_percent"
> {
  let level = 1;
  for (const threshold of XP_LEVELS) {
    if (xp >= threshold.xp_required) level = threshold.level;
    else break;
  }
  const current      = XP_LEVELS.find((l) => l.level === level)!;
  const next         = XP_LEVELS.find((l) => l.level === level + 1);
  const xpIntoLevel  = xp - current.xp_required;
  const xpNeeded     = next ? next.xp_required - current.xp_required : 1;
  return {
    level,
    level_label:         current.label,
    xp_to_next_level:    next ? next.xp_required - xp : 0,
    xp_progress_percent: Math.min(100, Math.round((xpIntoLevel / xpNeeded) * 100)),
  };
}

export const useGamificationStore = create<GamificationStore>()(
  persist(
    (set) => ({
      xp:                        0,
      level:                     1,
      level_label:               XP_LEVELS[0].label,
      xp_to_next_level:          XP_LEVELS[1].xp_required,
      xp_progress_percent:       0,
      streak_current:            0,
      streak_longest:            0,
      streak_last_activity:      null,
      unlocked_badges:           [],
      recent_xp_events:          [],
      weekly_challenge:          null,
      pending_badge_unlock:      null,

      setXP: (xp) => set({ xp, ...computeLevel(xp) }),

      addXP: (amount) =>
        set((s) => {
          const newXP = s.xp + amount;
          return { xp: newXP, ...computeLevel(newXP) };
        }),

      setStreak: (streak_current, streak_longest, streak_last_activity) =>
        set({ streak_current, streak_longest, streak_last_activity }),

      unlockBadge: (id) =>
        set((s) =>
          s.unlocked_badges.includes(id)
            ? {}
            : { unlocked_badges: [...s.unlocked_badges, id] },
        ),

      setPendingBadge: (pending_badge_unlock) => set({ pending_badge_unlock }),

      setWeeklyChallenge: (weekly_challenge) => set({ weekly_challenge }),

      resetGamification: () =>
        set({
          xp:                        0,
          level:                     1,
          level_label:               XP_LEVELS[0].label,
          xp_to_next_level:          XP_LEVELS[1].xp_required,
          xp_progress_percent:       0,
          streak_current:            0,
          streak_longest:            0,
          streak_last_activity:      null,
          unlocked_badges:           [],
          recent_xp_events:          [],
          weekly_challenge:          null,
          pending_badge_unlock:      null,
        }),
    }),
    { name: "confideq-gamification" },
  ),
);

// ─────────────────────────────────────────────────────────────────
// Level → badge map
// Awards a badge when the user first reaches a given level.
// ─────────────────────────────────────────────────────────────────

const LEVEL_BADGES: Partial<Record<number, BadgeId>> = {
  5:  "level_5",
  10: "level_10",
  20: "level_20",
  50: "level_50",
};

// ─────────────────────────────────────────────────────────────────
// useGamification hook
// ─────────────────────────────────────────────────────────────────

export function useGamification() {
  const { user } = useAuthStore();
  const store    = useGamificationStore();

  // ── Load from DB on mount ─────────────────────────────────────

  useEffect(() => {
    if (!user?.id) return;
    void loadGamificationData();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadGamificationData(): Promise<void> {
    if (!user) return;

    const [profileRes, badgesRes, challengeRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("xp, streak_days, longest_streak, last_active_date")
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
        .maybeSingle(),
    ]);

    if (profileRes.data) {
      const p = profileRes.data;
      store.setXP(p.xp ?? 0);
      store.setStreak(
        p.streak_days         ?? 0,
        p.longest_streak      ?? 0,
        p.last_active_date    ?? null,
      );
    }

    if (badgesRes.data) {
      badgesRes.data.forEach((b) => store.unlockBadge(b.badge_id as BadgeId));
    }

    if (challengeRes.data) {
      store.setWeeklyChallenge(challengeRes.data as GamificationState["weekly_challenge"]);
    }
  }

  // ── Core: unlock a badge ──────────────────────────────────────

  const unlockBadge = useCallback(async (badgeId: BadgeId): Promise<void> => {
    if (!user) return;
    // Guard: already unlocked locally — skip everything
    if (useGamificationStore.getState().unlocked_badges.includes(badgeId)) return;

    store.unlockBadge(badgeId);
    store.setPendingBadge(badgeId); // triggers toast animation in UI

    // Persist badge + trigger any bonus XP in the edge function
    try {
      await fetchEdge("unlock-badge", { badge_id: badgeId });
    } catch { /* non-fatal — badge is already saved locally */ }

    // Award bonus XP defined on the badge (e.g. achievement completionist bonus)
    const bonus = BADGE_DEFINITIONS[badgeId]?.xp_bonus ?? 0;
    if (bonus > 0) store.addXP(bonus);

    // Clear pending after the animation window
    setTimeout(() => store.setPendingBadge(null), 4000);
  }, [user, store]);

  // ── Core: award XP + check level-up badges ───────────────────

  const awardXP = useCallback(async (
    eventType: XPEventType,
    metadata: Record<string, unknown> = {},
  ): Promise<void> => {
    if (!user) return;

    const amount    = XP_REWARDS[eventType] ?? 0;
    if (!amount) return;

    const prevLevel = useGamificationStore.getState().level;
    store.addXP(amount);

    // Persist to DB via edge function (non-blocking)
    try {
      await fetchEdge("award-xp", { event_type: eventType, xp: amount, metadata });
    } catch { /* non-fatal */ }

    // ── Level-up achievement check ────────────────────────────
    // Re-read from store after the addXP call so we get the post-update level
    const newLevel = useGamificationStore.getState().level;
    if (newLevel > prevLevel) {
      // Award level badge if one is defined for this level
      const levelBadge = LEVEL_BADGES[newLevel];
      if (levelBadge) await unlockBadge(levelBadge);

      // Also check the badge baked into the XP_LEVELS definition (legacy path)
      const levelDef = XP_LEVELS.find((l) => l.level === newLevel);
      if (levelDef?.badge_id && levelDef.badge_id !== levelBadge) {
        await unlockBadge(levelDef.badge_id as BadgeId);
      }
    }
  }, [user, store, unlockBadge]);

  // ── Check session-count badges ────────────────────────────────

  const checkSessionBadges = useCallback(async (
    totalSessions: number,
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

  // ── Update streak + award streak badges ───────────────────────

  const updateStreak = useCallback(async (): Promise<void> => {
    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("streak_days, longest_streak, last_active_date")
      .eq("id", user.id)
      .single();

    if (!data) return;

    const lastActivity = data.last_active_date
      ? new Date(data.last_active_date)
      : null;
    const now      = new Date();
    const daysDiff = lastActivity
      ? Math.floor((now.getTime() - lastActivity.getTime()) / 86_400_000)
      : null;

    let newStreak = data.streak_days ?? 0;
    if (daysDiff === null || daysDiff > 1) {
      newStreak = 1;
    } else if (daysDiff === 1) {
      newStreak += 1;
    }

    const newLongest = Math.max(newStreak, data.longest_streak ?? 0);
    store.setStreak(newStreak, newLongest, now.toISOString());

    // Persist updated streak to DB
    await supabase
      .from("profiles")
      .update({
        streak_days:       newStreak,
        longest_streak:    newLongest,
        last_active_date:  now.toISOString(),
      })
      .eq("id", user.id);

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

    // Award streak milestone XP every 7-day multiple
    if (newStreak > 0 && newStreak % 7 === 0) {
      await awardXP("streak_milestone");
    }
  }, [user, store, awardXP, unlockBadge]);

  // ─────────────────────────────────────────────────────────────
  // ── Post-session trigger (live + mock) ───────────────────────
  // Call this from the session-completion handler in
  // LiveSessionController or MockSession after the session record
  // has been saved to the DB.
  // ─────────────────────────────────────────────────────────────

  const checkPostSessionAchievements = useCallback(async (params: {
    /** "live" = live co-pilot session, "mock" = mock interview */
    sessionType:      "live" | "mock";
    /** Total completed sessions for this user (fetched from DB before calling) */
    totalSessions:    number;
    /** Duration of this session in minutes */
    durationMinutes?: number;
    /** Number of filler words detected (from diarization/audit panel) */
    fillerWordCount?: number;
    /** Overall score 0-100 (from AI debrief, if available) */
    score?:           number;
    /** Whether a debrief was completed after this session */
    debriefCompleted?: boolean;
  }): Promise<void> => {
    if (!user) return;

    // 1. Award session-completion XP
    await awardXP(
      params.sessionType === "live"
        ? "live_session_complete"
        : "mock_session_complete",
    );

    // 2. First-ever session bonus XP
    if (params.totalSessions === 1) {
      await awardXP("first_session");
    }

    // 3. Session-count milestone badges
    await checkSessionBadges(params.totalSessions);

    // 4. Perfect score achievement (score >= 95 out of 100)
    if (params.score !== undefined && params.score >= 95) {
      await awardXP("perfect_score");
      await unlockBadge("perfect_score");
    }

    // 5. Zero filler words achievement
    // Only valid for sessions of meaningful length (>= 5 min) to avoid
    // trivially short sessions triggering the badge.
    if (
      params.fillerWordCount === 0 &&
      params.durationMinutes !== undefined &&
      params.durationMinutes >= 5
    ) {
      await awardXP("zero_filler_session");
      await unlockBadge("zero_filler");
    }

    // 6. Debrief completion XP
    if (params.debriefCompleted) {
      await awardXP("debrief_complete");
    }

    // 7. Update streak (must come last so streak count is current)
    await updateStreak();
  }, [user, awardXP, checkSessionBadges, unlockBadge, updateStreak]);

  // ─────────────────────────────────────────────────────────────
  // ── Post-mock-test trigger ────────────────────────────────────
  // Call this from MockSession after answers are submitted and the
  // result is returned from the edge function.
  // ─────────────────────────────────────────────────────────────

  const checkMockTestAchievements = useCallback(async (params: {
    /** Score for this mock test, 0-100 */
    score:          number;
    /** Total mock tests completed (including this one) */
    totalMockTests: number;
    /** Whether the user answered all questions (did not skip any) */
    allAnswered:    boolean;
  }): Promise<void> => {
    if (!user) return;

    // 1. Mock session XP
    await awardXP("mock_session_complete");

    // 2. Session badge milestones (mock tests count toward total sessions)
    await checkSessionBadges(params.totalMockTests);

    // 3. Perfect mock score
    if (params.score >= 95) {
      await awardXP("perfect_score");
      await unlockBadge("perfect_score");
    }

    // 4. Weekly challenge completion — check if this test satisfies
    //    the active weekly challenge (e.g. "Complete 3 mock tests this week")
    const challenge = useGamificationStore.getState().weekly_challenge;
    if (challenge && !challenge.completed) {
      const updatedProgress = (challenge.progress ?? 0) + 1;
      if (updatedProgress >= (challenge.goal ?? 1)) {
        await awardXP("weekly_challenge_complete");
        // Persist challenge completion
        await supabase
          .from("weekly_challenges")
          .update({
            progress:     updatedProgress,
            completed:    true,
          })
          .eq("id", challenge.id);
        store.setWeeklyChallenge({ ...challenge, completed: true, progress: updatedProgress });
      } else {
        await supabase
          .from("weekly_challenges")
          .update({ progress: updatedProgress })
          .eq("id", challenge.id);
        store.setWeeklyChallenge({ ...challenge, progress: updatedProgress });
      }
    }

    // 5. Update streak
    await updateStreak();
  }, [user, store, awardXP, checkSessionBadges, unlockBadge, updateStreak]);

  // ─────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────

  return {
    // State
    xp:                store.xp,
    level:             store.level,
    levelLabel:        store.level_label,
    xpToNextLevel:     store.xp_to_next_level,
    xpProgressPercent: store.xp_progress_percent,
    streakCurrent:     store.streak_current,
    streakLongest:     store.streak_longest,
    unlockedBadges:    store.unlocked_badges,
    weeklyChallenge:   store.weekly_challenge,
    pendingBadge:      store.pending_badge_unlock,

    // Core actions
    awardXP,
    unlockBadge,
    updateStreak,
    checkSessionBadges,
    clearPendingBadge: () => store.setPendingBadge(null),

    // Composite trigger functions — call these from session/test completion
    checkPostSessionAchievements,
    checkMockTestAchievements,
  };
}
