import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { CoachingContext, AnswerSummary } from "@/types/ai.types";
import type {
  ExperienceLevel,
  CoachTone,
  HintStyle,
} from "@/types/user.types";
import type { InterviewType } from "@/types/session.types";
import type { FillerWord } from "@/types/session.types";

// ─────────────────────────────────────────────────────────────────
// Coach Store — owns the full CoachingContext sent to every AI call
// ─────────────────────────────────────────────────────────────────

interface CoachStore {
  context: CoachingContext | null;
  is_context_ready: boolean;

  // Build / update context
  initContext: (context: CoachingContext) => void;
  updateContext: (patch: Partial<CoachingContext>) => void;
  clearContext: () => void;

  // Session-level updates
  incrementQuestionNumber: () => void;
  addAnswerSummary: (summary: AnswerSummary) => void;
  updateFillerCount: (count: number) => void;
  updateWPM: (wpm: number) => void;
  addWeakArea: (area: string) => void;
  addStrongArea: (area: string) => void;
  setTargetCompany: (company: string | null) => void;
  setInterviewType: (type: InterviewType) => void;
  setSessionGoals: (goals: string[]) => void;
  addFillerToWatch: (filler: FillerWord) => void;

  // Convenience selectors
  getContext: () => CoachingContext | null;
  isReady: () => boolean;
}

export const useCoachStore = create<CoachStore>()(
  subscribeWithSelector((set, get) => ({
    context: null,
    is_context_ready: false,

    initContext: (context) =>
      set({ context, is_context_ready: true }),

    updateContext: (patch) =>
      set((state) =>
        state.context
          ? { context: { ...state.context, ...patch } }
          : {}
      ),

    clearContext: () => set({ context: null, is_context_ready: false }),

    incrementQuestionNumber: () =>
      set((state) =>
        state.context
          ? {
              context: {
                ...state.context,
                question_number: state.context.question_number + 1,
              },
            }
          : {}
      ),

    addAnswerSummary: (summary) =>
      set((state) => {
        if (!state.context) return {};
        const summaries = [
          summary,
          ...state.context.last_3_answer_summaries,
        ].slice(0, 3);
        return {
          context: { ...state.context, last_3_answer_summaries: summaries },
        };
      }),

    updateFillerCount: (current_filler_count) =>
      set((state) =>
        state.context ? { context: { ...state.context, current_filler_count } } : {}
      ),

    updateWPM: (current_wpm) =>
      set((state) =>
        state.context ? { context: { ...state.context, current_wpm } } : {}
      ),

    addWeakArea: (area) =>
      set((state) => {
        if (!state.context) return {};
        const weak_areas = state.context.weak_areas.includes(area)
          ? state.context.weak_areas
          : [...state.context.weak_areas, area];
        return { context: { ...state.context, weak_areas } };
      }),

    addStrongArea: (area) =>
      set((state) => {
        if (!state.context) return {};
        const strong_areas = state.context.strong_areas.includes(area)
          ? state.context.strong_areas
          : [...state.context.strong_areas, area];
        return { context: { ...state.context, strong_areas } };
      }),

    setTargetCompany: (target_company) =>
      set((state) =>
        state.context ? { context: { ...state.context, target_company } } : {}
      ),

    setInterviewType: (session_type) =>
      set((state) =>
        state.context ? { context: { ...state.context, session_type } } : {}
      ),

    setSessionGoals: (session_goals) =>
      set((state) =>
        state.context ? { context: { ...state.context, session_goals } } : {}
      ),

    addFillerToWatch: (filler) =>
      set((state) => {
        if (!state.context) return {};
        const existing = state.context.filler_words_to_watch;
        if (existing.includes(filler)) return {};
        return {
          context: {
            ...state.context,
            filler_words_to_watch: [...existing, filler],
          },
        };
      }),

    getContext: () => get().context,
    isReady: () => get().is_context_ready,
  }))
);
