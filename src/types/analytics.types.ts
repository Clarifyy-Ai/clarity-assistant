// ─────────────────────────────────────────────────────────────────
// Analytics Types
// ─────────────────────────────────────────────────────────────────

import type { InterviewType, SessionMode } from "./session.types";

// ── Data Points ───────────────────────────────────────────────────

export interface ConfidenceTrendPoint {
  date: string;                    // ISO date "YYYY-MM-DD"
  score: number;                   // 0–100
  session_id: string;
  session_mode: SessionMode;
  interview_type: InterviewType;
  is_real_interview: boolean;
}

export interface FillerWordTrendPoint {
  date: string;
  filler_rate: number | null;      // fillers per minute
  total_fillers: number | null;    // absolute count when known; never invent from rate
  session_id?: string;
  top_filler: string | null;
}

export interface WPMTrendPoint {
  date: string;
  wpm_avg: number;
  wpm_min: number;
  wpm_max: number;
  session_id: string;
}

// ── Scorecard dimension averages ──────────────────────────────────

export interface DimensionAverages {
  communication: number | null;
  technical: number | null;
  problem_solving: number | null;
  confidence: number | null;
}

// ── Radar / Category Breakdown ────────────────────────────────────

export interface WeakSpotRadarData {
  interview_type: InterviewType;
  label: string;
  avg_score: number;               // 0–100
  session_count: number;
  trend: "improving" | "declining" | "stable";
}

// ── Strength Report ───────────────────────────────────────────────

export interface StrengthArea {
  category: string;
  avg_score: number;
  sessions_count: number;
  best_session_id: string | null;
  best_score: number;
  description: string;
}

export interface WeaknessArea {
  category: string;
  avg_score: number;
  sessions_count: number;
  worst_session_id: string | null;
  worst_score: number;
  recommendation: string;
}

// ── Session Comparison ────────────────────────────────────────────

export interface SessionComparisonData {
  source_version: string;
  baseline_rule: "older_session";
  timezone: string;
  baseline: SessionAnalyticsSummary;
  comparison: SessionAnalyticsSummary;
  session_a: SessionAnalyticsSummary;
  session_b: SessionAnalyticsSummary;
  score_delta: number | null;
  filler_delta: number | null;
  wpm_delta: number | null;
  improvement_areas: string[];
  regression_areas: string[];
  deltas?: {
    overall_score: number | null;
    communication: number | null;
    technical: number | null;
    problem_solving: number | null;
    confidence: number | null;
    filler_rate: number | null;
    wpm_avg: number | null;
    duration_seconds: number | null;
    question_count: number | null;
    answered_count: number | null;
  };
}

export type AnalyticsScoreStatus =
  | "scored"
  | "not_scored"
  | "pending"
  | "failed"
  | "excluded";

export interface SessionAnalyticsSummary {
  session_id: string;
  date: string;
  started_at?: string | null;
  ended_at?: string | null;
  mode: SessionMode | string;
  interview_type?: InterviewType | string | null;
  company: string | null;
  title?: string | null;
  status?: string | null;
  completion_state?: "completed" | "incomplete" | "deleted" | "invalid";
  overall_score: number | null;
  score_status: AnalyticsScoreStatus;
  filler_rate: number | null;
  wpm_avg: number | null;
  duration_minutes: number | null;
  duration_seconds?: number | null;
  question_count: number | null;
  answered_count?: number | null;
  unanswered_count?: number | null;
  comparable?: boolean;
}

// ── Leaderboard ───────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  display_name: string;            // anonymised or real — user's choice
  avatar_initial: string;
  experience_level: string;
  improvement_rate: number;        // % score increase over 30 days
  streak: number;
  is_current_user: boolean;
}

export interface LeaderboardState {
  entries: LeaderboardEntry[];
  current_user_rank: number | null;
  period: "weekly" | "monthly" | "all_time";
  scope: "global" | "same_level";
  is_opted_in: boolean;
}

// ── Full Analytics Dashboard Data ─────────────────────────────────

export interface AnalyticsDashboardData {
  // Summary cards
  total_sessions: number;
  total_practice_hours: number;
  avg_confidence_score: number | null;
  avg_confidence_delta_30d: number | null; // positive = improved
  avg_filler_rate: number | null;
  avg_filler_delta_30d: number | null;
  avg_wpm: number | null;
  avg_wpm_delta_30d: number | null;
  current_streak: number | null;
  longest_streak: number | null;
  total_xp: number;

  // Chart data
  confidence_trend: ConfidenceTrendPoint[];
  filler_trend: FillerWordTrendPoint[];
  wpm_trend: WPMTrendPoint[];
  weak_spot_radar: WeakSpotRadarData[];
  /** Avg scorecard dimension scores for the selected period (null when absent). */
  dimension_averages: DimensionAverages | null;

  // Reports
  strengths: StrengthArea[];
  weaknesses: WeaknessArea[];

  // Leaderboard
  leaderboard: LeaderboardState;

  // Session list for comparison
  recent_sessions: SessionAnalyticsSummary[];

  /** Sessions per local calendar day (display timezone) — same set as recent_sessions. */
  activity_by_day?: Record<string, number>;
  /** Sessions with a numeric scorecard score in the selected period. */
  sessions_scored?: number;

  // Period
  period_start: string;
  period_end: string;
  generated_at: string;
}

// ── Analytics Filter ──────────────────────────────────────────────

export type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";
export type AnalyticsSessionFilter = "all" | "mock" | "live" | "real_interview";

export interface AnalyticsFilter {
  period: AnalyticsPeriod;
  session_filter: AnalyticsSessionFilter;
  interview_type: InterviewType | "all";
}

// ── Admin Analytics ───────────────────────────────────────────────

export interface AdminAnalyticsSummary {
  total_users: number;
  active_users_7d: number;
  active_users_30d: number;
  new_signups_7d: number;
  new_signups_30d: number;
  total_sessions_7d: number;
  total_ai_calls_7d: number;
  total_credits_consumed_7d: number;
  mrr_usd: number;
  arr_usd: number;
  churn_rate_30d: number;
  plan_breakdown: Record<string, number>;
  model_usage_breakdown: Record<string, number>;
  avg_session_duration_minutes: number;
  top_companies_targeted: Array<{ company: string; count: number }>;
}
