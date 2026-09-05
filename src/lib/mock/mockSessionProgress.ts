// Mid-session mock progress stored on sessions.notes (no migration).

import type { SessionQuestion } from "@/types/session.types";
import type { MockAnswerStatus, AnswerFinalizationOutcome } from "@/lib/mock/answerNextFsm";
import {
  isInterviewContextSnapshot,
  type InterviewContextSnapshot,
} from "@/lib/mock/interviewContext";
import {
  isInterviewBlueprint,
  type InterviewBlueprint,
} from "@/lib/mock/interviewBlueprint";
import type { TtsPlaybackRecord } from "@/lib/mock/ttsPlayback";
import type { DurableMockTurn } from "@/lib/mock/durableMockTurns";

export const SKIPPED_ANSWER_SENTINEL = "(skipped)";

export const MOCK_PROGRESS_MARKER = "__clarify_mock_progress__";

export type MockProgressAnswer = {
  question_id: string | null;
  question_text: string;
  answer_text: string;
  question_index: number;
  skipped: boolean;
  status: MockAnswerStatus;
  outcome: AnswerFinalizationOutcome;
  filler_count: number;
  wpm: number;
  duration_seconds: number;
  timestamp: string;
  parent_question_id?: string | null;
  is_follow_up?: boolean;
  answer_source?: "spoken" | "typed" | "mixed" | "skipped" | "unanswered";
};

export type MockSessionProgressV1 = {
  [MOCK_PROGRESS_MARKER]: true;
  v: 1;
  current_question_index: number;
  elapsed_seconds: number;
  target_question_count: number;
  started_at: string;
  questions: SessionQuestion[];
  answers: MockProgressAnswer[];
};

export type MockSessionProgressV2 = {
  [MOCK_PROGRESS_MARKER]: true;
  v: 2;
  current_question_index: number;
  elapsed_seconds: number;
  target_question_count: number;
  started_at: string;
  questions: SessionQuestion[];
  answers: MockProgressAnswer[];
  interview_context: InterviewContextSnapshot | null;
  interview_blueprint: InterviewBlueprint | null;
  /** Follow-ups used under current parent topic. */
  follow_ups_used_for_parent: number;
  current_parent_question_id: string | null;
  tts_playback: TtsPlaybackRecord | null;
  blueprint_slot_index: number;
  /** Phase 3 durable turn model embedded in session notes. */
  durable_turns?: DurableMockTurn[];
};

export type MockSessionProgress = MockSessionProgressV1 | MockSessionProgressV2;

export function encodeMockProgressNotes(
  progress: Omit<MockSessionProgressV2, typeof MOCK_PROGRESS_MARKER | "v"> & { v?: 2 },
): string {
  const payload: MockSessionProgressV2 = {
    [MOCK_PROGRESS_MARKER]: true,
    v: 2,
    current_question_index: progress.current_question_index,
    elapsed_seconds: progress.elapsed_seconds,
    target_question_count: progress.target_question_count,
    started_at: progress.started_at,
    questions: progress.questions,
    answers: progress.answers,
    interview_context: progress.interview_context ?? null,
    interview_blueprint: progress.interview_blueprint ?? null,
    follow_ups_used_for_parent: progress.follow_ups_used_for_parent ?? 0,
    current_parent_question_id: progress.current_parent_question_id ?? null,
    tts_playback: progress.tts_playback ?? null,
    blueprint_slot_index: progress.blueprint_slot_index ?? progress.current_question_index,
    durable_turns: progress.durable_turns ?? [],
  };
  return JSON.stringify(payload);
}

function asV2(parsed: MockSessionProgressV1 | MockSessionProgressV2): MockSessionProgressV2 {
  if (parsed.v === 2) return parsed;
  return {
    [MOCK_PROGRESS_MARKER]: true,
    v: 2,
    current_question_index: parsed.current_question_index,
    elapsed_seconds: parsed.elapsed_seconds,
    target_question_count: parsed.target_question_count,
    started_at: parsed.started_at,
    questions: parsed.questions,
    answers: parsed.answers,
    interview_context: null,
    interview_blueprint: null,
    follow_ups_used_for_parent: 0,
    current_parent_question_id: null,
    tts_playback: null,
    blueprint_slot_index: parsed.current_question_index,
    durable_turns: [],
  };
}

export function parseMockProgressNotes(
  notes: string | null | undefined,
): MockSessionProgressV2 | null {
  if (!notes || typeof notes !== "string") return null;
  const trimmed = notes.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const raw = JSON.parse(trimmed) as Record<string, unknown>;
    if (!raw || raw[MOCK_PROGRESS_MARKER] !== true) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = raw as any;
    if (parsed.v !== 1 && parsed.v !== 2) return null;
    if (!Array.isArray(parsed.questions) || typeof parsed.current_question_index !== "number") {
      return null;
    }
    const base: MockSessionProgressV1 | MockSessionProgressV2 =
      parsed.v === 2
        ? {
            [MOCK_PROGRESS_MARKER]: true,
            v: 2,
            current_question_index: Math.max(0, parsed.current_question_index),
            elapsed_seconds: Math.max(0, Number(parsed.elapsed_seconds) || 0),
            target_question_count: Math.max(
              1,
              Number(parsed.target_question_count) || parsed.questions.length || 5,
            ),
            started_at:
              typeof parsed.started_at === "string" && parsed.started_at
                ? parsed.started_at
                : new Date().toISOString(),
            questions: parsed.questions as SessionQuestion[],
            answers: Array.isArray(parsed.answers)
              ? (parsed.answers as MockProgressAnswer[])
              : [],
            interview_context: isInterviewContextSnapshot(parsed.interview_context)
              ? parsed.interview_context
              : null,
            interview_blueprint: isInterviewBlueprint(parsed.interview_blueprint)
              ? parsed.interview_blueprint
              : null,
            follow_ups_used_for_parent: Math.max(
              0,
              Number(parsed.follow_ups_used_for_parent) || 0,
            ),
            current_parent_question_id:
              typeof parsed.current_parent_question_id === "string"
                ? parsed.current_parent_question_id
                : null,
            tts_playback: parsed.tts_playback ?? null,
            blueprint_slot_index: Math.max(
              0,
              Number(parsed.blueprint_slot_index) || parsed.current_question_index,
            ),
            durable_turns: Array.isArray(parsed.durable_turns)
              ? (parsed.durable_turns as DurableMockTurn[])
              : [],
          }
        : {
            [MOCK_PROGRESS_MARKER]: true,
            v: 1,
            current_question_index: Math.max(0, parsed.current_question_index),
            elapsed_seconds: Math.max(0, Number(parsed.elapsed_seconds) || 0),
            target_question_count: Math.max(
              1,
              Number(parsed.target_question_count) || parsed.questions.length || 5,
            ),
            started_at:
              typeof parsed.started_at === "string" && parsed.started_at
                ? parsed.started_at
                : new Date().toISOString(),
            questions: parsed.questions as SessionQuestion[],
            answers: Array.isArray(parsed.answers)
              ? (parsed.answers as MockProgressAnswer[])
              : [],
          };
    return asV2(base);
  } catch {
    return null;
  }
}

export function isSkippedAnswerText(answer: string | null | undefined): boolean {
  const t = (answer ?? "").trim();
  return t.length === 0 || t === SKIPPED_ANSWER_SENTINEL;
}
