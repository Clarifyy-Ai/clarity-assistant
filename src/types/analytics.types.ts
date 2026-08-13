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
  filler_rate: number;             // fillers per minute
  total_fillers: number;
  session_id: string;
  top_filler: string | null;
}

export interface WPMTrendPoint {
  date: string;
  wpm_avg: number;
  wpm_min: number;
  wpm_max: number;
  session_id: string;
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
  session_a: SessionAnalyticsSummary;
  session_b: SessionAnalyticsSummary;
  score_delta: number;
  filler_delta: number;            // negative = improvement
  wpm_delta: number;
  improvement_areas: string[];
  regression_areas: string[];
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
  mode: SessionMode;
  interview_type: InterviewType;
  company: string | null;
  overall_score: number | null;
  score_status: AnalyticsScoreStatus;
  filler_rate: number | null;
  wpm_avg: number | null;
  duration_minutes: number;
  question_count: number;
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
  avg_confidence_score: number;
  avg_confidence_delta_30d: number; // positive = improved
  avg_filler_rate: number;
  avg_filler_delta_30d: number;
  avg_wpm: number;
  current_streak: number;
  longest_streak: number;
  total_xp: number;

  // Chart data
  confidence_trend: ConfidenceTrendPoint[];
  filler_trend: FillerWordTrendPoint[];
  wpm_trend: WPMTrendPoint[];
  weak_spot_radar: WeakSpotRadarData[];

  // Reports
  strengths: StrengthArea[];
  weaknesses: WeaknessArea[];

  // Leaderboard
  leaderboard: LeaderboardState;

  // Session list for comparison
  recent_sessions: SessionAnalyticsSummary[];

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
