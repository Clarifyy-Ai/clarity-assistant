// ─────────────────────────────────────────────────────────────────
// Interview Scheduler Types
// ─────────────────────────────────────────────────────────────────

import type { InterviewType } from "./session.types";

// ── Pipeline Stages ───────────────────────────────────────────────

export type InterviewStage =
  | "wishlist"
  | "applied"
  | "phone_screen"
  | "technical_round"
  | "final_round"
  | "offer"
  | "rejected"
  | "withdrawn";

export const INTERVIEW_STAGE_LABELS: Record<InterviewStage, string> = {
  wishlist:         "Wishlist",
  applied:          "Applied",
  phone_screen:     "Phone Screen",
  technical_round:  "Technical",
  final_round:      "Final Round",
  offer:            "Offer",
  rejected:         "Rejected",
  withdrawn:        "Withdrawn",
};

export const PIPELINE_ACTIVE_STAGES: InterviewStage[] = [
  "applied",
  "phone_screen",
  "technical_round",
  "final_round",
];

// ── Interview Round ───────────────────────────────────────────────

export interface InterviewRound {
  id: string;
  interview_id: string;
  round_number: number;
  round_label: string;             // e.g. "Round 1 - Technical Screen"
  interview_type: InterviewType;
  scheduled_at: string | null;     // ISO datetime
  timezone: string | null;         // IANA zone used when scheduling (null = local browser)
  duration_minutes: number | null;
  interviewer_name: string | null;
  interviewer_title: string | null;
  platform: InterviewPlatform | null;
  meeting_link: string | null;
  status: RoundStatus;
  outcome: RoundOutcome | null;
  notes: string | null;
  session_id: string | null;       // linked Career Pilot session
  debrief_id: string | null;       // linked debrief
  created_at: string;
  updated_at: string;
}

export type InterviewPlatform =
  | "zoom"
  | "google_meet"
  | "teams"
  | "phone"
  | "onsite"
  | "other";

export type RoundStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "rescheduled";

export type RoundOutcome =
  | "passed"
  | "failed"
  | "pending_decision"
  | "withdrew";

// ── Scheduled Interview ───────────────────────────────────────────

export interface ScheduledInterview {
  id: string;
  user_id: string;
  company_name: string;
  role_title: string;
  stage: InterviewStage;
  rounds: InterviewRound[];
  next_round: InterviewRound | null;
  resume_id: string | null;
  jd_id: string | null;
  job_posting_url: string | null;
  salary_range: string | null;
  location: string | null;
  is_remote: boolean;
  notes: string | null;
  priority: "low" | "medium" | "high";
  is_today: boolean;               // computed — next_round is today
  calendar_event_id: string | null; // Google/Outlook event ID
  calendar_sync_status?: string | null;
  timezone?: string | null;
  company_research_id: string | null;
  /** Optional interview-level duration when no round is selected. */
  duration_minutes?: number | null;
  /** Optional meeting URL when no round is selected. */
  meeting_link?: string | null;
  created_at: string;
  updated_at: string;
}

// ── Interview Day ─────────────────────────────────────────────────

export interface TodayInterview {
  interview: ScheduledInterview;
  round: InterviewRound;
  minutes_until: number;           // negative if started
  is_imminent: boolean;            // < 30 min away
  is_active: boolean;              // within scheduled window
  has_debrief: boolean;
}

// ── Calendar Sync ─────────────────────────────────────────────────

export type CalendarProvider = "google" | "outlook";

export interface CalendarSyncState {
  provider: CalendarProvider | null;
  is_connected: boolean;
  last_synced_at: string | null;
  sync_error: string | null;
  pending_events: CalendarEvent[];
}

export interface CalendarEvent {
  external_id: string;
  provider: CalendarProvider;
  title: string;
  start_at: string;
  end_at: string;
  description: string | null;
  meeting_link: string | null;
  attendees: string[];
  is_mapped: boolean;              // mapped to a Career Pilot interview
  mapped_interview_id: string | null;
}

// ── Interview Scheduler Store ─────────────────────────────────────

export interface InterviewSchedulerStoreState {
  interviews: ScheduledInterview[];
  today_interviews: TodayInterview[];
  pipeline_by_stage: Record<InterviewStage, ScheduledInterview[]>;
  calendar_sync: CalendarSyncState;
  is_loading: boolean;
  load_error: string | null;
  selected_interview_id: string | null;
}

// ── Interview Form ────────────────────────────────────────────────

export interface InterviewFormValues {
  company_name: string;
  role_title: string;
  stage: InterviewStage;
  priority: "low" | "medium" | "high";
  is_remote: boolean;
  location: string;
  job_posting_url: string;
  salary_range: string;
  notes: string;
  resume_id: string | null;
  jd_id: string | null;
}

export interface RoundFormValues {
  round_number: number;
  round_label: string;
  interview_type: InterviewType;
  scheduled_at: string;
  duration_minutes: number;
  interviewer_name: string;
  interviewer_title: string;
  platform: InterviewPlatform;
  meeting_link: string;
  notes: string;
  timezone?: string;
}
