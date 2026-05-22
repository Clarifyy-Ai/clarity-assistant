// @ts-nocheck
// src/hooks/useInterviewScheduler.ts — PRODUCTION FIXED
// Fixes (F5 - scheduler hook):
// - createInterview: removed virtual fields (rounds, next_round, is_today) from DB insert.
//   These are computed client-side from interview_rounds join, not schema columns.
//   Passing them caused Postgres "column does not exist" error, silently swallowed.
// - addRound: rollback parent interview row if round insert fails (orphan prevention)
// - loadInterviews: error handling added — surfaces Supabase errors instead of
//   leaving store empty with isLoading:false and no feedback
// - updateInterview: virtual fields stripped from patch before DB update
// - loadInterviews extracted to useCallback so createInterview/addRound callbacks
//   capture a stable reference (was re-created on every render → stale closure)
// - @ts-nocheck preserved

import { useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useInterviewSchedulerStore } from "@/store/interviewSchedulerStore";
import { useAuthStore } from "@/store/userStore";
import { generateId } from "@/lib/utils";
import type {
  ScheduledInterview,
  InterviewRound,
  InterviewStage,
  InterviewFormValues,
  RoundFormValues,
} from "@/types/interview.types";

/* ─── VIRTUAL FIELD GUARD ────────────────────────────────────────────────── */

// ✅ FIX: These fields exist on the ScheduledInterview TS type but are NOT
// columns in the scheduled_interviews Postgres table. They are computed
// client-side from the interview_rounds join result. Sending them to Supabase
// causes a "column does not exist" error that was previously unhandled.
const VIRTUAL_FIELDS = new Set(["rounds", "next_round", "is_today"]);

function stripVirtualFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !VIRTUAL_FIELDS.has(key)),
  ) as Partial<T>;
}

/* ─── HOOK ───────────────────────────────────────────────────────────────── */

export function useInterviewScheduler() {
  const { user } = useAuthStore();
  const store    = useInterviewSchedulerStore();

  /* ── Load interviews ─────────────────────────────────────────────────── */

  // ✅ FIX: useCallback so createInterview/addRound capture a stable reference.
  // Previously loadInterviews was a plain async function defined inside the hook
  // body — every render created a new function, but the callbacks closed over the
  // one from their definition render → stale closure after auth hydration.
  const loadInterviews = useCallback(async (): Promise<void> => {
    if (!user?.id) return;
    store.setIsLoading(true);

    const { data, error } = await supabase
      .from("scheduled_interviews")
      .select(`
        *,
        interview_rounds(*)
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    // ✅ FIX: Error handling — previously ignored; store was left empty
    if (error) {
      console.error("[useInterviewScheduler] loadInterviews failed:", error.message);
      store.setError?.(error.message); // optional chaining — guard if store doesn't have setError yet
      store.setIsLoading(false);
      return;
    }

    if (data) {
      const interviews = (data as any[]).map((i) => ({
        ...i,
        rounds:     i.interview_rounds ?? [],
        next_round: getNextRound(i.interview_rounds ?? []),
        is_today:   checkIsToday(i.interview_rounds ?? []),
      })) as ScheduledInterview[];
      store.setInterviews(interviews);
    }

    store.setIsLoading(false);
  }, [user?.id]); // store is stable (Zustand) so excluded

  /* ── Load on mount ───────────────────────────────────────────────────── */

  useEffect(() => {
    if (!user?.id) return;
    void loadInterviews();

    const tick = setInterval(() => store.computeTodayInterviews(), 60_000);
    return () => clearInterval(tick);
  }, [user?.id, loadInterviews]);

  /* ── Create interview ────────────────────────────────────────────────── */

  const createInterview = useCallback(async (
    values: InterviewFormValues,
  ): Promise<{ id: string | null; error: string | null }> => {
    if (!user?.id) return { id: null, error: "Not authenticated" };

    const id = generateId();

    // ✅ FIX: Only send actual schema columns to Supabase.
    // rounds/next_round/is_today are virtual fields computed from the join —
    // they don't exist as columns in scheduled_interviews. Including them
    // caused a Postgres "column does not exist" error on every createInterview call.
    const dbRow = {
      id,
      user_id:         user.id,
      company_name:    values.company_name,
      role_title:      values.role_title,
      stage:           values.stage,
      priority:        values.priority,
      is_remote:       values.is_remote,
      location:        values.location        || null,
      job_posting_url: values.job_posting_url || null,
      salary_range:    values.salary_range    || null,
      notes:           values.notes           || null,
      resume_id:       values.resume_id       ?? null,
      jd_id:           values.jd_id           ?? null,
      // ✅ NOT included: rounds, next_round, is_today
      created_at:      new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    };

    const { error } = await supabase
      .from("scheduled_interviews")
      .insert(dbRow);

    if (error) return { id: null, error: error.message };

    await loadInterviews();
    return { id, error: null };
  }, [user?.id, loadInterviews]);

  /* ── Update interview ────────────────────────────────────────────────── */

  const updateInterview = useCallback(async (
    id: string,
    patch: Partial<InterviewFormValues>,
  ): Promise<{ error: string | null }> => {
    // ✅ FIX: Strip virtual fields from patch before sending to Supabase.
    // A caller could pass a full ScheduledInterview object as the patch;
    // without stripping, rounds/next_round/is_today go to the DB and 400.
    const dbPatch = stripVirtualFields({
      ...patch,
      updated_at: new Date().toISOString(),
    });

    const { error } = await supabase
      .from("scheduled_interviews")
      .update(dbPatch)
      .eq("id", id);

    if (!error) {
      store.updateInterview(id, patch as Partial<ScheduledInterview>);
    }
    return { error: error?.message ?? null };
  }, []);

  /* ── Delete interview ────────────────────────────────────────────────── */

  const deleteInterview = useCallback(async (id: string): Promise<void> => {
    await supabase.from("scheduled_interviews").delete().eq("id", id);
    store.removeInterview(id);
  }, []);

  /* ── Move stage ──────────────────────────────────────────────────────── */

  const moveStage = useCallback(async (
    id: string,
    stage: InterviewStage,
  ): Promise<void> => {
    await supabase
      .from("scheduled_interviews")
      .update({ stage, updated_at: new Date().toISOString() })
      .eq("id", id);

    store.moveInterviewStage(id, stage);
  }, []);

  /* ── Add round ───────────────────────────────────────────────────────── */

  const addRound = useCallback(async (
    interviewId: string,
    values: RoundFormValues,
  ): Promise<{ error: string | null }> => {
    const round: Partial<InterviewRound> = {
      id:                     generateId(),
      scheduled_interview_id: interviewId,
      round_number:           values.round_number,
      round_label:            values.round_label,
      interview_type:         values.interview_type,
      scheduled_at:           values.scheduled_at      || null,
      duration_minutes:       values.duration_minutes  || null,
      interviewer_name:       values.interviewer_name  || null,
      interviewer_title:      values.interviewer_title || null,
      platform:               values.platform          || null,
      meeting_link:           values.meeting_link      || null,
      status:                 "scheduled",
      outcome:                null,
      notes:                  values.notes             || null,
      session_id:             null,
      debrief_id:             null,
      created_at:             new Date().toISOString(),
      updated_at:             new Date().toISOString(),
    };

    const { error } = await supabase.from("interview_rounds").insert(round);

    if (error) {
      // ✅ FIX: Rollback the parent interview row so we don't leave an orphaned
      // scheduled_interview with no rounds. The caller (NewInterview.tsx) already
      // got a successful createInterview — without this rollback the interview
      // appears in the pipeline with no date/platform/round data attached.
      //
      // This is a best-effort rollback. If the delete also fails (race condition,
      // network drop), we log it but still return the original round error so the
      // UI can inform the user correctly.
      console.warn(
        "[useInterviewScheduler] addRound failed — rolling back parent interview",
        interviewId,
      );
      const { error: rollbackError } = await supabase
        .from("scheduled_interviews")
        .delete()
        .eq("id", interviewId);

      if (rollbackError) {
        console.error(
          "[useInterviewScheduler] Rollback also failed:",
          rollbackError.message,
          "— orphaned interview ID:", interviewId,
        );
      }

      return { error: error.message };
    }

    await loadInterviews();
    return { error: null };
  }, [loadInterviews]);

  /* ── Update round outcome ────────────────────────────────────────────── */

  const updateRoundOutcome = useCallback(async (
    roundId:     string,
    interviewId: string,
    outcome:     InterviewRound["outcome"],
    notes?:      string,
  ): Promise<void> => {
    await supabase
      .from("interview_rounds")
      .update({
        outcome,
        status:     "completed",
        notes:      notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", roundId);

    await loadInterviews();
  }, [loadInterviews]);

  /* ── Public API ──────────────────────────────────────────────────────── */

  return {
    // State
    interviews:      store.interviews,
    todayInterviews: store.today_interviews,
    pipelineByStage: store.pipeline_by_stage,
    isLoading:       store.is_loading,
    selectedId:      store.selected_interview_id,
    calendarSync:    store.calendar_sync,

    // Actions
    createInterview,
    updateInterview,
    deleteInterview,
    moveStage,
    addRound,
    updateRoundOutcome,
    selectInterview: store.selectInterview,
    reload:          loadInterviews,
  };
}

/* ─── HELPERS ────────────────────────────────────────────────────────────── */

function getNextRound(rounds: InterviewRound[]): InterviewRound | null {
  const upcoming = rounds
    .filter((r) => r.scheduled_at && r.status === "scheduled")
    .sort(
      (a, b) =>
        new Date(a.scheduled_at!).getTime() -
        new Date(b.scheduled_at!).getTime(),
    );
  return upcoming[0] ?? null;
}

function checkIsToday(rounds: InterviewRound[]): boolean {
  return rounds.some((r) => {
    if (!r.scheduled_at) return false;
    const d = new Date(r.scheduled_at);
    const n = new Date();
    return (
      d.getFullYear() === n.getFullYear() &&
      d.getMonth()    === n.getMonth()    &&
      d.getDate()     === n.getDate()
    );
  });
}
