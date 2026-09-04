// src/store/sessionStore.ts

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  ActiveSessionState,
  SessionConfig,
  LiveSessionConfig,
  SessionQuestion,
  SessionMode,
  SessionStatus,
  CoachMessage,
  WPMDataPoint,
  FillerWordOccurrence,
} from "@/types/session.types";
import { PANIC_RESPONSE } from "@/types/session.types";
import {
  currentPauseDurationMs,
  extendExpiresAtIso,
} from "@/lib/session/practiceSessionLease";

// ─────────────────────────────────────────────────────────────────
// Session Store
// ─────────────────────────────────────────────────────────────────

interface PanicDisplay {
  step_1: string;
  step_2: string;
  step_3: string;
}

interface SessionStore extends ActiveSessionState {
  // Setters
  setSessionId: (id: string | null) => void;
  setMode: (mode: SessionMode) => void;
  setStatus: (status: SessionStatus) => void;
  setConfig: (config: SessionConfig | LiveSessionConfig | null) => void;
  setExpiresAt: (expiresAt: string | null) => void;
  setStartedAt: (startedAt: string | null) => void;
  /** Apply lease fields from start/restore/heartbeat without resetting the session. */
  applyServerLease: (lease: {
    expires_at?: string | null;
    started_at?: string | null;
  }) => void;
  /** Stamp pause start; no-op if already paused. */
  markPaused: (atMs?: number) => void;
  /**
   * Close pause window: accrue pause ms, clear paused_at, extend expires_at.
   * Returns pause duration applied (ms).
   */
  markResumed: (atMs?: number) => number;
  /** Hydrate pause fields after refresh / restore. */
  hydratePauseState: (input: {
    paused_at: string | null;
    total_paused_ms?: number;
    expires_at?: string | null;
    elapsed_seconds?: number;
  }) => void;
  setQuestions: (questions: SessionQuestion[]) => void;
  /** Append a newly generated question and make it current (does not reset index to 0). */
  appendAndActivateQuestion: (question: SessionQuestion) => void;
  setCurrentQuestionIndex: (index: number) => void;
  advanceQuestion: () => void;

  // Real-time metrics
  incrementFillerCount: () => void;
  setFillerCount: (count: number) => void;
  resetFillerCount: () => void;
  setCurrentWPM: (wpm: number) => void;
  setIsAnswering: (answering: boolean) => void;
  setAnswerDraft: (text: string) => void;
  tickElapsed: () => void;
  tickQuestionElapsed: () => void;
  resetQuestionElapsed: () => void;
  setElapsedSeconds: (seconds: number) => void;

  // Advanced metrics (optional now, but matches analytics schema). [file:1][file:3]
  setWpmSeries: (points: WPMDataPoint[]) => void;
  setFillerOccurrences: (occurrences: FillerWordOccurrence[]) => void;

  // Credits
  consumeCredit: (amount?: number) => void;

  // Coach chat
  addCoachMessage: (message: CoachMessage) => void;
  updateLastCoachMessage: (content: string, isDone: boolean) => void;
  clearCoachMessages: () => void;

  // Panic
  triggerPanic: () => PanicDisplay;

  // Reset
  resetSession: () => void;
}

const INITIAL_STATE: ActiveSessionState & {
  wpm_series?: WPMDataPoint[];
  filler_occurrences?: FillerWordOccurrence[];
} = {
  session_id: null,
  mode: "mock",
  status: "idle",
  config: null,
  expires_at: null,
  started_at: null,
  paused_at: null,
  total_paused_ms: 0,
  current_question_index: 0,
  current_question: null,
  questions: [],
  filler_count: 0,
  current_wpm: 0,
  elapsed_seconds: 0,
  question_elapsed_seconds: 0,
  is_answering: false,
  answer_draft: "",
  coach_messages: [],
  credits_consumed: 0,
  // Extra metrics fields – optional, used by analytics pipeline / mock engine. [file:1][file:3]
  wpm_series: [],
  filler_occurrences: [],
};

export const useSessionStore = create<SessionStore>()(
  subscribeWithSelector((set, get) => ({
    ...INITIAL_STATE,

    setSessionId: (session_id) => set({ session_id }),
    setMode: (mode) => set({ mode }),
    setStatus: (status) => set({ status }),
    setConfig: (config) => set({ config }),
    setExpiresAt: (expires_at) => set({ expires_at }),
    setStartedAt: (started_at) => set({ started_at }),
    applyServerLease: (lease) =>
      set((state) => ({
        expires_at:
          lease.expires_at !== undefined ? lease.expires_at ?? null : state.expires_at,
        started_at:
          lease.started_at !== undefined ? lease.started_at ?? null : state.started_at,
      })),

    markPaused: (atMs = Date.now()) =>
      set((state) => {
        if (state.paused_at) return {};
        return { paused_at: new Date(atMs).toISOString() };
      }),

    markResumed: (atMs = Date.now()) => {
      const state = get();
      if (!state.paused_at) return 0;
      const pauseMs = currentPauseDurationMs(state.paused_at, atMs);
      const nextTotal = state.total_paused_ms + pauseMs;
      const nextExpires = extendExpiresAtIso(state.expires_at, pauseMs);
      set({
        paused_at: null,
        total_paused_ms: nextTotal,
        expires_at: nextExpires ?? state.expires_at,
      });
      return pauseMs;
    },

    hydratePauseState: (input) =>
      set((state) => ({
        paused_at: input.paused_at,
        total_paused_ms:
          typeof input.total_paused_ms === "number"
            ? Math.max(0, input.total_paused_ms)
            : state.total_paused_ms,
        expires_at:
          input.expires_at !== undefined ? input.expires_at ?? null : state.expires_at,
        elapsed_seconds:
          typeof input.elapsed_seconds === "number"
            ? Math.max(0, Math.floor(input.elapsed_seconds))
            : state.elapsed_seconds,
      })),

    setQuestions: (questions) =>
      set({
        questions,
        current_question: questions[0] ?? null,
        current_question_index: 0,
      }),

    appendAndActivateQuestion: (question) =>
      set((state) => {
        const questions = [...state.questions, question];
        const index = questions.length - 1;
        return {
          questions,
          current_question_index: index,
          current_question: question,
          question_elapsed_seconds: 0,
          filler_count: 0,
          answer_draft: "",
          is_answering: false,
        };
      }),

    setCurrentQuestionIndex: (index) =>
      set((state) => ({
        current_question_index: index,
        current_question: state.questions[index] ?? null,
        question_elapsed_seconds: 0,
        filler_count: 0,
        answer_draft: "",
        is_answering: false,
      })),

    advanceQuestion: () => {
      const state = get();
      const next = state.current_question_index + 1;
      if (next < state.questions.length) {
        set({
          current_question_index: next,
          current_question: state.questions[next] ?? null,
          question_elapsed_seconds: 0,
          answer_draft: "",
          is_answering: false,
        });
      } else {
        set({ status: "completed" });
      }
    },

    incrementFillerCount: () =>
      set((state) => ({ filler_count: state.filler_count + 1 })),

    setFillerCount: (count) => set({ filler_count: count }),

    resetFillerCount: () => set({ filler_count: 0 }),

    setCurrentWPM: (wpm) => set({ current_wpm: wpm }),

    setIsAnswering: (is_answering) => set({ is_answering }),

    setAnswerDraft: (answer_draft) => set({ answer_draft }),

    tickElapsed: () =>
      set((state) => ({ elapsed_seconds: state.elapsed_seconds + 1 })),

    tickQuestionElapsed: () =>
      set((state) => ({
        question_elapsed_seconds: state.question_elapsed_seconds + 1,
      })),

    resetQuestionElapsed: () => set({ question_elapsed_seconds: 0 }),

    setElapsedSeconds: (seconds) =>
      set({ elapsed_seconds: Math.max(0, Math.floor(seconds)) }),

    setWpmSeries: (points) => set({ wpm_series: points } as any),
    setFillerOccurrences: (occurrences) =>
      set({ filler_occurrences: occurrences } as any),

    consumeCredit: (amount = 1) =>
      set((state) => ({
        credits_consumed: state.credits_consumed + amount,
      })),

    addCoachMessage: (message) =>
      set((state) => ({
        coach_messages: [...state.coach_messages, message],
      })),

    updateLastCoachMessage: (content, isDone) =>
      set((state) => {
        const messages = [...state.coach_messages];
        if (messages.length === 0) return {};
        const last = messages[messages.length - 1];
        messages[messages.length - 1] = {
          ...last,
          content,
          is_streaming: !isDone,
        };
        return { coach_messages: messages };
      }),

    clearCoachMessages: () => set({ coach_messages: [] }),

    triggerPanic: () => PANIC_RESPONSE,

    resetSession: () => set(INITIAL_STATE),
  })),
);
