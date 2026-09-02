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
import { useEffect, useCallback } from "react";
import {
  scheduledInterviewsDB,
  interviewRoundsDB,
} from "@/lib/supabase/database";
import { useInterviewSchedulerStore } from "@/store/interviewSchedulerStore";
import { useAuthStore } from "@/store/userStore";
import { generateId } from "@/lib/utils";
import { schedulerCompanyNameSchema, schedulerRoleTitleSchema, schedulerTimezoneSchema } from "@/lib/validators/interviewSchemas";
import { subscribeFocusRecovery } from "@/lib/focusRecovery";
import { toSafeUiError } from "@/lib/focusRecovery";
import { isScheduledToday, persistableIanaTimezone, resolveSchedulerTimezoneKey } from "@/lib/interviews/schedulerTimezone";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase";
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
    const hadData = useInterviewSchedulerStore.getState().interviews.length > 0;
    if (!hadData) store.setIsLoading(true);
    store.setLoadError(null);

    try {
      const data = await scheduledInterviewsDB.listWithRoundsByUserId(user.id);

      type InterviewRow = ScheduledInterview & {
        interview_rounds?: InterviewRound[];
      };

      const interviews = (data as unknown as InterviewRow[]).map((i) => ({
        ...i,
        rounds:     i.interview_rounds ?? [],
        next_round: getNextRound(i.interview_rounds ?? []),
        is_today:   checkIsToday(i.interview_rounds ?? [], i.timezone),
      })) as ScheduledInterview[];
      store.setInterviews(interviews);
    } catch (err) {
      const message = toSafeUiError(err, "Couldn't load interviews");
      console.error("[useInterviewScheduler] loadInterviews failed:", err);
      store.setLoadError(message);
    } finally {
      store.setIsLoading(false);
    }
  }, [user?.id]); // store is stable (Zustand) so excluded

  /* ── Load on mount ───────────────────────────────────────────────────── */

  useEffect(() => {
    if (!user?.id) return;
    void loadInterviews();

    const tick = setInterval(() => store.computeTodayInterviews(), 60_000);
    const unsub = subscribeFocusRecovery((plan) => {
      if (plan.revalidate.includes("interviews")) {
        void loadInterviews();
      }
    });
    return () => {
      clearInterval(tick);
      unsub();
    };
  }, [user?.id, loadInterviews]);

  /* ── Create interview ────────────────────────────────────────────────── */

  const createInterview = useCallback(async (
    values: InterviewFormValues,
  ): Promise<{ id: string | null; error: string | null }> => {
    if (!user?.id) return { id: null, error: "Not authenticated" };

    const company = schedulerCompanyNameSchema.safeParse(values.company_name);
    const role = schedulerRoleTitleSchema.safeParse(values.role_title);
    if (!company.success) {
      return { id: null, error: company.error.issues[0]?.message ?? "Invalid company name" };
    }
    if (!role.success) {
      return { id: null, error: role.error.issues[0]?.message ?? "Invalid role title" };
    }

    const id = generateId();

    // ✅ FIX: Only send actual schema columns to Supabase.
    // rounds/next_round/is_today are virtual fields computed from the join —
    // they don't exist as columns in scheduled_interviews. Including them
    // caused a Postgres "column does not exist" error on every createInterview call.
    const dbRow = {
      id,
      user_id:         user.id,
      company_name:    company.data,
      role_title:      role.data,
      stage:           values.stage,
      priority:        values.priority,
      is_remote:       values.is_remote,
      location:        values.location        || null,
      job_posting_url: values.job_posting_url || null,
      salary_range:    values.salary_range    || null,
      notes:           values.notes           || null,
      resume_id:       values.resume_id       ?? null,
      jd_id:           values.jd_id           ?? null,
      timezone:        persistableIanaTimezone((values as { timezone?: string }).timezone),
      // ✅ NOT included: rounds, next_round, is_today
      created_at:      new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    };

    try {
      await scheduledInterviewsDB.create(dbRow);
      await loadInterviews();
      return { id, error: null };
    } catch (err) {
      return {
        id: null,
        error: err instanceof Error ? err.message : "Failed to create interview",
      };
    }
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

    try {
      await scheduledInterviewsDB.update(id, dbPatch as TablesUpdate<"scheduled_interviews">);
      await loadInterviews();
      return { error: null };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Failed to update interview",
      };
    }
  }, [loadInterviews]);

  /* ── Delete interview ────────────────────────────────────────────────── */

  const deleteInterview = useCallback(async (id: string): Promise<void> => {
    await scheduledInterviewsDB.delete(id);
    store.removeInterview(id);
  }, []);

  /* ── Move stage ──────────────────────────────────────────────────────── */

  const moveStage = useCallback(async (
    id: string,
    stage: InterviewStage,
  ): Promise<void> => {
    await scheduledInterviewsDB.update(id, {
      stage,
      updated_at: new Date().toISOString(),
    });

    store.moveInterviewStage(id, stage);
  }, []);

  /* ── Add round ───────────────────────────────────────────────────────── */

  const addRound = useCallback(async (
    interviewId: string,
    values: RoundFormValues,
  ): Promise<{ error: string | null }> => {
    if (values.scheduled_at) {
      const when = new Date(values.scheduled_at);
      if (!Number.isFinite(when.getTime()) || when.getTime() <= Date.now()) {
        return { error: "Scheduled time must be in the future." };
      }
    }
    const timezone = schedulerTimezoneSchema.safeParse(
      (values as { timezone?: string }).timezone ?? "local",
    );
    if (!timezone.success) {
      return { error: timezone.error.issues[0]?.message ?? "Invalid timezone" };
    }
    const round: Partial<InterviewRound> & Record<string, any> = {
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
      timezone:               persistableIanaTimezone(timezone.data),
      session_id:             null,
      debrief_id:             null,
      created_at:             new Date().toISOString(),
      updated_at:             new Date().toISOString(),
    };

    try {
      await interviewRoundsDB.create(round as TablesInsert<"interview_rounds">);
      await loadInterviews();
      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add round";
      console.warn(
        "[useInterviewScheduler] addRound failed for interview",
        interviewId,
        message,
      );
      // Do not delete the parent interview — NewInterview treats round failure as
      // non-fatal and the user can edit/add the round later. Deleting here caused
      // successful schedules to vanish from the list after a round insert error.
      return { error: message };
    }
  }, [loadInterviews]);

  /* ── Update round ────────────────────────────────────────────────────── */

  const updateRound = useCallback(async (
    roundId: string,
    values: Partial<RoundFormValues> & { status?: InterviewRound["status"] },
    options?: { previousScheduledAt?: string | null },
  ): Promise<{ error: string | null }> => {
    if (values.scheduled_at) {
      const when = new Date(values.scheduled_at);
      const prevMs = options?.previousScheduledAt
        ? new Date(options.previousScheduledAt).getTime()
        : null;
      const unchanged = prevMs !== null && when.getTime() === prevMs;
      if (
        !unchanged &&
        (!Number.isFinite(when.getTime()) || when.getTime() <= Date.now())
      ) {
        return { error: "Scheduled time must be in the future." };
      }
    }

    let timezoneValue: string | null | undefined;
    if (values.timezone !== undefined) {
      const timezone = schedulerTimezoneSchema.safeParse(values.timezone ?? "local");
      if (!timezone.success) {
        return {
          error: timezone.error.issues[0]?.message ?? "Invalid timezone",
        };
      }
      timezoneValue = timezone.data === "local" ? null : timezone.data;
    }

    const { timezone: _tz, ...rest } = values;
    const dbPatch = {
      ...rest,
      ...(timezoneValue !== undefined ? { timezone: timezoneValue } : {}),
      updated_at: new Date().toISOString(),
    };

    try {
      await interviewRoundsDB.update(roundId, dbPatch as TablesUpdate<"interview_rounds">);
      await loadInterviews();
      return { error: null };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Failed to update round",
      };
    }
  }, [loadInterviews]);

  /* ── Update round outcome ────────────────────────────────────────────── */

  const updateRoundOutcome = useCallback(async (
    roundId:     string,
    interviewId: string,
    outcome:     InterviewRound["outcome"],
    notes?:      string,
  ): Promise<void> => {
    await interviewRoundsDB.update(roundId, {
      outcome,
      status: "completed",
      notes: notes ?? null,
      updated_at: new Date().toISOString(),
    });

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
    updateRound,
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

function checkIsToday(rounds: InterviewRound[], interviewTimezone?: string | null): boolean {
  return rounds.some((r) => {
    if (!r.scheduled_at) return false;
    const tz = resolveSchedulerTimezoneKey(r.timezone, interviewTimezone);
    return isScheduledToday(r.scheduled_at, tz);
  });
}
