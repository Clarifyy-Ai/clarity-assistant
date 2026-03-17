import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { isToday, isPast, differenceInMinutes, parseISO } from "date-fns";
import type {
  InterviewSchedulerStoreState,
  ScheduledInterview,
  InterviewStage,
  TodayInterview,
  CalendarSyncState,
  CalendarProvider,
} from "@/types/interview.types";
import { PIPELINE_ACTIVE_STAGES } from "@/types/interview.types";

interface InterviewSchedulerStore extends InterviewSchedulerStoreState {
  // Interview CRUD
  setInterviews: (interviews: ScheduledInterview[]) => void;
  addInterview: (interview: ScheduledInterview) => void;
  updateInterview: (id: string, patch: Partial<ScheduledInterview>) => void;
  removeInterview: (id: string) => void;
  moveInterviewStage: (id: string, stage: InterviewStage) => void;
  selectInterview: (id: string | null) => void;

  // Today's interviews
  computeTodayInterviews: () => void;

  // Calendar sync
  setCalendarSync: (sync: Partial<CalendarSyncState>) => void;
  setCalendarProvider: (provider: CalendarProvider | null) => void;
  setCalendarConnected: (connected: boolean) => void;
  setCalendarSyncError: (error: string | null) => void;
  setLastSynced: (at: string | null) => void;

  // Loading
  setIsLoading: (loading: boolean) => void;

  // Reset
  resetScheduler: () => void;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function buildPipelineByStage(
  interviews: ScheduledInterview[]
): Record<InterviewStage, ScheduledInterview[]> {
  const stages: InterviewStage[] = [
    "wishlist", "applied", "phone_screen", "technical_round",
    "final_round", "offer", "rejected", "withdrawn",
  ];
  const map = Object.fromEntries(
    stages.map((s) => [s, [] as ScheduledInterview[]])
  ) as Record<InterviewStage, ScheduledInterview[]>;

  for (const interview of interviews) {
    map[interview.stage].push(interview);
  }
  return map;
}

function computeTodayInterviewsFromList(
  interviews: ScheduledInterview[]
): TodayInterview[] {
  const todayList: TodayInterview[] = [];

  for (const interview of interviews) {
    for (const round of interview.rounds) {
      if (!round.scheduled_at) continue;
      const scheduledDate = parseISO(round.scheduled_at);
      if (!isToday(scheduledDate)) continue;

      const minutesUntil = differenceInMinutes(scheduledDate, new Date());
      const durationMs = (round.duration_minutes ?? 60) * 60 * 1000;
      const endTime = scheduledDate.getTime() + durationMs;
      const isActive = isPast(scheduledDate) && Date.now() < endTime;

      todayList.push({
        interview,
        round,
        minutes_until: minutesUntil,
        is_imminent: minutesUntil >= 0 && minutesUntil <= 30,
        is_active:    isActive,
        has_debrief:  !!round.debrief_id,
      });
    }
  }

  // Sort by scheduled time ascending
  todayList.sort((a, b) =>
    new Date(a.round.scheduled_at!).getTime() -
    new Date(b.round.scheduled_at!).getTime()
  );

  return todayList;
}

// ─────────────────────────────────────────────────────────────────
// Initial State
// ─────────────────────────────────────────────────────────────────

const INITIAL_CALENDAR_SYNC: CalendarSyncState = {
  provider: null,
  is_connected: false,
  last_synced_at: null,
  sync_error: null,
  pending_events: [],
};

const INITIAL_STATE: InterviewSchedulerStoreState = {
  interviews: [],
  today_interviews: [],
  pipeline_by_stage: buildPipelineByStage([]),
  calendar_sync: INITIAL_CALENDAR_SYNC,
  is_loading: false,
  selected_interview_id: null,
};

// ─────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────

export const useInterviewSchedulerStore = create<InterviewSchedulerStore>()(
  subscribeWithSelector((set, get) => ({
    ...INITIAL_STATE,

    // ── Interview CRUD ─────────────────────────────────────
    setInterviews: (interviews) =>
      set({
        interviews,
        pipeline_by_stage: buildPipelineByStage(interviews),
        today_interviews:  computeTodayInterviewsFromList(interviews),
      }),

    addInterview: (interview) =>
      set((s) => {
        const interviews = [...s.interviews, interview];
        return {
          interviews,
          pipeline_by_stage: buildPipelineByStage(interviews),
          today_interviews:  computeTodayInterviewsFromList(interviews),
        };
      }),

    updateInterview: (id, patch) =>
      set((s) => {
        const interviews = s.interviews.map((i) =>
          i.id === id
            ? { ...i, ...patch, updated_at: new Date().toISOString() }
            : i
        );
        return {
          interviews,
          pipeline_by_stage: buildPipelineByStage(interviews),
          today_interviews:  computeTodayInterviewsFromList(interviews),
        };
      }),

    removeInterview: (id) =>
      set((s) => {
        const interviews = s.interviews.filter((i) => i.id !== id);
        return {
          interviews,
          pipeline_by_stage: buildPipelineByStage(interviews),
          today_interviews:  computeTodayInterviewsFromList(interviews),
          selected_interview_id:
            s.selected_interview_id === id ? null : s.selected_interview_id,
        };
      }),

    moveInterviewStage: (id, stage) =>
      set((s) => {
        const interviews = s.interviews.map((i) =>
          i.id === id
            ? { ...i, stage, updated_at: new Date().toISOString() }
            : i
        );
        return {
          interviews,
          pipeline_by_stage: buildPipelineByStage(interviews),
        };
      }),

    selectInterview: (selected_interview_id) => set({ selected_interview_id }),

    // ── Today recompute ────────────────────────────────────
    computeTodayInterviews: () =>
      set((s) => ({
        today_interviews: computeTodayInterviewsFromList(s.interviews),
      })),

    // ── Calendar sync ──────────────────────────────────────
    setCalendarSync: (sync) =>
      set((s) => ({
        calendar_sync: { ...s.calendar_sync, ...sync },
      })),

    setCalendarProvider: (provider) =>
      set((s) => ({
        calendar_sync: { ...s.calendar_sync, provider },
      })),

    setCalendarConnected: (is_connected) =>
      set((s) => ({
        calendar_sync: { ...s.calendar_sync, is_connected },
      })),

    setCalendarSyncError: (sync_error) =>
      set((s) => ({
        calendar_sync: { ...s.calendar_sync, sync_error },
      })),

    setLastSynced: (last_synced_at) =>
      set((s) => ({
        calendar_sync: { ...s.calendar_sync, last_synced_at },
      })),

    // ── Loading ────────────────────────────────────────────
    setIsLoading: (is_loading) => set({ is_loading }),

    // ── Reset ──────────────────────────────────────────────
    resetScheduler: () => set(INITIAL_STATE),
  }))
);
