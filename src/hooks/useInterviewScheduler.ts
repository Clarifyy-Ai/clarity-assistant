// @ts-nocheck
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

// ─────────────────────────────────────────────────────────────────
// useInterviewScheduler
// Full CRUD for scheduled interviews, rounds, pipeline kanban,
// and calendar sync.
// ─────────────────────────────────────────────────────────────────

export function useInterviewScheduler() {
  const { user }    = useAuthStore();
  const store       = useInterviewSchedulerStore();

  // ── Load on mount ─────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    loadInterviews();

    // Recompute today interviews every minute
    const tick = setInterval(
      () => store.computeTodayInterviews(),
      60_000
    );
    return () => clearInterval(tick);
  }, [user?.id]);

  async function loadInterviews(): Promise<void> {
    store.setIsLoading(true);
    const { data } = await supabase
      .from("scheduled_interviews")
      .select(`
        *,
        interview_rounds(*)
      `)
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

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
  }

  // ── Create interview ──────────────────────────────────────────

  const createInterview = useCallback(async (
    values: InterviewFormValues
  ): Promise<{ id: string | null; error: string | null }> => {
    if (!user) return { id: null, error: "Not authenticated" };

    const id = generateId();
    const interview: Partial<ScheduledInterview> = {
      id,
      user_id:         user.id,
      company_name:    values.company_name,
      role_title:      values.role_title,
      stage:           values.stage,
      priority:        values.priority,
      is_remote:       values.is_remote,
      location:        values.location || null,
      job_posting_url: values.job_posting_url || null,
      salary_range:    values.salary_range || null,
      notes:           values.notes || null,
      resume_id:       values.resume_id,
      jd_id:           values.jd_id,
      rounds:          [],
      next_round:      null,
      is_today:        false,
      created_at:      new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    };

    const { error } = await supabase
      .from("scheduled_interviews")
      .insert(interview);

    if (error) return { id: null, error: error.message };

    await loadInterviews();
    return { id, error: null };
  }, [user]);

  // ── Update interview ──────────────────────────────────────────

  const updateInterview = useCallback(async (
    id: string,
    patch: Partial<InterviewFormValues>
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase
      .from("scheduled_interviews")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (!error) store.updateInterview(id, patch as Partial<ScheduledInterview>);
    return { error: error?.message ?? null };
  }, []);

  // ── Delete interview ──────────────────────────────────────────

  const deleteInterview = useCallback(async (id: string): Promise<void> => {
    await supabase.from("scheduled_interviews").delete().eq("id", id);
    store.removeInterview(id);
  }, []);

  // ── Move stage ────────────────────────────────────────────────

  const moveStage = useCallback(async (
    id: string,
    stage: InterviewStage
  ): Promise<void> => {
    await supabase
      .from("scheduled_interviews")
      .update({ stage, updated_at: new Date().toISOString() })
      .eq("id", id);

    store.moveInterviewStage(id, stage);
  }, []);

  // ── Add round ─────────────────────────────────────────────────

  const addRound = useCallback(async (
    interviewId: string,
    values: RoundFormValues
  ): Promise<{ error: string | null }> => {
    const round: Partial<InterviewRound> = {
      id:                generateId(),
      interview_id:      interviewId,
      round_number:      values.round_number,
      round_label:       values.round_label,
      interview_type:    values.interview_type,
      scheduled_at:      values.scheduled_at || null,
      duration_minutes:  values.duration_minutes || null,
      interviewer_name:  values.interviewer_name || null,
      interviewer_title: values.interviewer_title || null,
      platform:          values.platform || null,
      meeting_link:      values.meeting_link || null,
      status:            "scheduled",
      outcome:           null,
      notes:             values.notes || null,
      session_id:        null,
      debrief_id:        null,
      created_at:        new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    };

    const { error } = await supabase.from("interview_rounds").insert(round);
    if (!error) await loadInterviews();
    return { error: error?.message ?? null };
  }, []);

  // ── Update round outcome ──────────────────────────────────────

  const updateRoundOutcome = useCallback(async (
    roundId: string,
    interviewId: string,
    outcome: InterviewRound["outcome"],
    notes?: string
  ): Promise<void> => {
    await supabase
      .from("interview_rounds")
      .update({
        outcome,
        status: "completed",
        notes:  notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", roundId);

    await loadInterviews();
  }, []);

  return {
    // State
    interviews:       store.interviews,
    todayInterviews:  store.today_interviews,
    pipelineByStage:  store.pipeline_by_stage,
    isLoading:        store.is_loading,
    selectedId:       store.selected_interview_id,
    calendarSync:     store.calendar_sync,

    // Actions
    createInterview,
    updateInterview,
    deleteInterview,
    moveStage,
    addRound,
    updateRoundOutcome,
    selectInterview:  store.selectInterview,
    reload:           loadInterviews,
  };
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function getNextRound(rounds: InterviewRound[]): InterviewRound | null {
  const upcoming = rounds
    .filter((r) => r.scheduled_at && r.status === "scheduled")
    .sort((a, b) =>
      new Date(a.scheduled_at!).getTime() -
      new Date(b.scheduled_at!).getTime()
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
