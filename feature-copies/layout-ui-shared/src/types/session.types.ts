// ─────────────────────────────────────────────────────────────────
// Session Types — Mock, Live, Room
// ─────────────────────────────────────────────────────────────────

import type { PreferredAIModel, HintStyle } from "./user.types";

// ── Interview Classification ──────────────────────────────────────

export type InterviewType =
  | "behavioural"
  | "behavioral"
  | "technical"
  | "coding"
  | "system_design"
  | "hr"
  | "mixed"
  | "product"
  | "leadership"
  | "case_study"
  | "sales"
  | "customer_success"
  | "internship"
  | "academic"
  | "government_exam";

export type SessionMode = "mock" | "live" | "room";

/** DB `session_type` values that permit server-side AI generation (see `sessionEnforcement.ts`). */
export const AI_ALLOWED_SESSION_TYPES = [
  "mock",
  "warmup",
  "rehearsal",
  "room",
  "practice",
] as const;

export type SessionStatus =
  | "idle"
  | "warming_up"
  | "active"
  | "paused"
  | "completed"
  | "abandoned";

// ── Session Config (set before session starts) ────────────────────

export interface SessionConfig {
  company: string | null;
  role: string | null;
  experience_level: string | null;
  interview_type: InterviewType;
  question_count: number;           // 5–20
  time_per_question_seconds: number;
  model: PreferredAIModel;
  hint_style: HintStyle;
  include_warmup: boolean;
  resume_id: string | null;
  jd_id: string | null;
  focus_areas: string[];            // e.g. ["system design", "leadership"]
}

// ── Live Session Config ───────────────────────────────────────────

export interface LiveSessionConfig {
  company: string | null;
  role: string | null;
  hint_style: HintStyle;
  model: PreferredAIModel;
  smart_routing: boolean;
  stealth_mode: boolean;
  resume_id: string | null;
  jd_id: string | null;
  interview_type: string;
  instructions: string;
  enable_system_audio: boolean;
  mic_device_id?: string | null;
  noise_suppression?: boolean;
  simple_language?: boolean;
  save_transcript?: boolean;
  session_call_type?: "interview" | "regular_call";
  context_document_ids?: string[];
  language?: string;
  duration_minutes?: number;
  /** Mock interview question difficulty (generate-questions / local bank). */
  difficulty?: "easy" | "medium" | "hard" | "mixed";
  question_count?: number;
  practice_context_id?: string | null;
  source_type?: "answer_bank" | "manual" | "interview_day" | null;
  seniority?: string | null;
  industry?: string | null;
  interview_stage?: string | null;
  focus_competencies?: string[];
  topics_to_avoid?: string[];
  answer_bank_context_ids?: string[];
  text_voice_mode?: "text" | "voice";
  tts_voice?: string | null;
  follow_up_depth?: "none" | "light" | "deep";
  feedback_style?: "concise" | "balanced" | "detailed";
}

// ── Question ──────────────────────────────────────────────────────

export interface SessionQuestion {
  id: string;
  session_id: string;
  question_number: number;
  question_text: string;
  question_type: InterviewType;
  expected_duration_seconds: number;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];                    // e.g. ["leadership", "conflict"]
  company_specific: boolean;
}

// ── Answer ────────────────────────────────────────────────────────

export interface SessionAnswer {
  id: string;
  session_id: string;
  question_id: string;
  transcript: string;
  word_count: number;
  duration_seconds: number;
  filler_words: FillerWordOccurrence[];
  filler_word_count: number;
  wpm_average: number;
  wpm_data: WPMDataPoint[];
  confidence_score: number;         // 0–100
  clarity_score: number;            // 0–100
  structure_score: number;          // 0–100 (STAR adherence)
  relevance_score: number;          // 0–100
  ideal_answer: string | null;
  ai_feedback: string | null;
  created_at: string;
}

// ── Filler Word Tracking ──────────────────────────────────────────

export type FillerWord =
  | "um" | "uh" | "like" | "basically" | "literally"
  | "you know" | "right" | "so" | "actually" | "kind of"
  | "sort of" | "just" | "I mean" | "okay" | "well";

export interface FillerWordOccurrence {
  word: FillerWord;
  count: number;
  timestamps: number[];             // seconds from answer start
}

export interface WPMDataPoint {
  timestamp: number;                // seconds from answer start
  wpm: number;
}

// ── Scorecard ─────────────────────────────────────────────────────

export interface SessionScorecard {
  session_id: string;
  overall_score: number;            // 0–100 weighted composite
  clarity_avg: number;
  structure_avg: number;
  relevance_avg: number;
  filler_total: number;
  filler_rate: number;              // fillers per minute
  wpm_average: number;
  longest_answer_seconds: number;
  shortest_answer_seconds: number;
  best_question_id: string | null;
  worst_question_id: string | null;
  improvement_areas: string[];
  strength_areas: string[];
  per_question: SessionAnswer[];
  share_token: string | null;       // public share link token
  pdf_url: string | null;
  created_at: string;
}

// ── Full Session Record ───────────────────────────────────────────

export interface SessionRecord {
  id: string;
  user_id: string;
  mode: SessionMode;
  status: SessionStatus;
  config: SessionConfig | LiveSessionConfig;
  questions: SessionQuestion[];
  answers: SessionAnswer[];
  scorecard: SessionScorecard | null;
  transcript_full: string | null;
  model_used: PreferredAIModel;
  credits_consumed: number;
  duration_seconds: number;
  started_at: string;
  ended_at: string | null;
  is_privacy_mode: boolean;
  room_id: string | null;
}

// ── Active Session State (in-memory during session) ───────────────

export interface ActiveSessionState {
  session_id: string | null;
  mode: SessionMode;
  status: SessionStatus;
  config: SessionConfig | LiveSessionConfig | null;
  current_question_index: number;
  current_question: SessionQuestion | null;
  questions: SessionQuestion[];
  filler_count: number;
  current_wpm: number;
  elapsed_seconds: number;
  question_elapsed_seconds: number;
  is_answering: boolean;
  answer_draft: string;
  coach_messages: CoachMessage[];
  credits_consumed: number;
}

// ── Coach Chat ────────────────────────────────────────────────────

export type CoachMessageRole = "user" | "assistant" | "system";

export interface CoachMessage {
  id: string;
  role: CoachMessageRole;
  content: string;
  timestamp: number;                // ms epoch
  is_streaming: boolean;
}

// ── Debrief ───────────────────────────────────────────────────────

export interface DebriefRecord {
  id: string;
  user_id: string;
  interview_id: string | null;      // linked scheduler interview
  raw_notes: string;
  mood_rating: 1 | 2 | 3 | 4 | 5;
  reconstructed_questions: string[];
  gap_areas: DebriefGapArea[];
  generated_practice_sessions: GeneratedPracticeSession[];
  ai_evaluation: string;
  created_at: string;
}

export interface DebriefGapArea {
  area: string;                     // e.g. "System Design", "Conflict Resolution"
  severity: "low" | "medium" | "high";
  recommendation: string;
}

export interface GeneratedPracticeSession {
  title: string;
  interview_type: InterviewType;
  focus_area: string;
  question_count: number;
  config: Partial<SessionConfig>;
}

// ── Warmup ────────────────────────────────────────────────────────

export interface WarmupQuestion {
  id: string;
  text: string;
  is_scored: false;
  category: "icebreaker" | "confidence_builder";
}

// ── Panic Response (deterministic, zero-latency) ──────────────────

export interface PanicResponse {
  step_1: string;  // "Take a breath."
  step_2: string;  // "Summarise the problem in one sentence."
  step_3: string;  // "Name one concrete next step."
}

export const PANIC_RESPONSE: PanicResponse = {
  step_1: "Take a slow breath — you have more time than you think.",
  step_2: "Summarise the problem in one sentence to show you understood it.",
  step_3: "Name one concrete approach or data structure and start from there.",
};
