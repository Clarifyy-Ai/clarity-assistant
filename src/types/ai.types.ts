// ─────────────────────────────────────────────────────────────────
// AI & Model Types
// ─────────────────────────────────────────────────────────────────

import type {
  PreferredAIModel,
  HintStyle,
  ExperienceLevel,
  CoachTone,
} from "./user.types";
import type { InterviewType, FillerWord } from "./session.types";

// ── Model Routing ─────────────────────────────────────────────────

export type AIProvider = "google" | "openai" | "anthropic";

export interface ModelConfig {
  id: PreferredAIModel;
  provider: AIProvider;
  display_name: string;
  description: string;
  avg_ttft_ms: number;             // avg time-to-first-token
  context_window: number;
  best_for: string[];
  cost_per_credit: number;         // credits consumed per call
  supports_vision: boolean;
  supports_streaming: boolean;
}

export const MODEL_CONFIGS: Record<PreferredAIModel, ModelConfig> = {
  "gemini-flash": {
    id: "gemini-flash",
    provider: "google",
    display_name: "Gemini Flash",
    description: "Fastest response — best for live hints",
    avg_ttft_ms: 400,
    context_window: 1_000_000,
    best_for: ["live_hints", "quick_answers"],
    cost_per_credit: 1,
    supports_vision: true,
    supports_streaming: true,
  },
  "gemini-pro": {
    id: "gemini-pro",
    provider: "google",
    display_name: "Gemini Pro",
    description: "Balanced quality + speed — best for mock sessions",
    avg_ttft_ms: 900,
    context_window: 1_000_000,
    best_for: ["mock_sessions", "star_builder"],
    cost_per_credit: 2,
    supports_vision: true,
    supports_streaming: true,
  },
  "gpt-4o": {
    id: "gpt-4o",
    provider: "openai",
    display_name: "GPT-4o",
    description: "Deep reasoning — best for behavioural & PM answers",
    avg_ttft_ms: 1200,
    context_window: 128_000,
    best_for: ["behavioural", "product_management", "leadership"],
    cost_per_credit: 3,
    supports_vision: true,
    supports_streaming: true,
  },
  "claude": {
    id: "claude",
    provider: "anthropic",
    display_name: "Claude",
    description: "Nuanced reasoning — best for system design & architecture",
    avg_ttft_ms: 1100,
    context_window: 200_000,
    best_for: ["system_design", "architecture", "leadership"],
    cost_per_credit: 3,
    supports_vision: false,
    supports_streaming: true,
  },
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    provider: "openai",
    display_name: "GPT-4o mini",
    description: "Fast OpenAI routing for lighter analysis calls",
    avg_ttft_ms: 700,
    context_window: 128_000,
    best_for: ["quick_answers", "analysis"],
    cost_per_credit: 1,
    supports_vision: true,
    supports_streaming: true,
  },
  "claude-3-5-sonnet": {
    id: "claude-3-5-sonnet",
    provider: "anthropic",
    display_name: "Claude 3.5 Sonnet",
    description: "High-quality Claude routing (maps to Claude family)",
    avg_ttft_ms: 1100,
    context_window: 200_000,
    best_for: ["system_design", "architecture", "leadership"],
    cost_per_credit: 3,
    supports_vision: false,
    supports_streaming: true,
  },
  "claude-3-haiku": {
    id: "claude-3-haiku",
    provider: "anthropic",
    display_name: "Claude 3 Haiku",
    description: "Fast Claude routing for live hints",
    avg_ttft_ms: 500,
    context_window: 200_000,
    best_for: ["live_hints", "quick_answers"],
    cost_per_credit: 1,
    supports_vision: false,
    supports_streaming: true,
  },
  "gemini-1-5-pro": {
    id: "gemini-1-5-pro",
    provider: "google",
    display_name: "Gemini 1.5 Pro",
    description: "Legacy Gemini Pro alias",
    avg_ttft_ms: 900,
    context_window: 1_000_000,
    best_for: ["mock_sessions", "star_builder"],
    cost_per_credit: 2,
    supports_vision: true,
    supports_streaming: true,
  },
  "gemini-1-5-flash": {
    id: "gemini-1-5-flash",
    provider: "google",
    display_name: "Gemini 1.5 Flash",
    description: "Legacy Gemini Flash alias",
    avg_ttft_ms: 400,
    context_window: 1_000_000,
    best_for: ["live_hints", "quick_answers"],
    cost_per_credit: 1,
    supports_vision: true,
    supports_streaming: true,
  },
};

// ── Network Modes ─────────────────────────────────────────────────

export type NetworkMode = "strong" | "degraded" | "offline";

export interface NetworkState {
  mode: NetworkMode;
  rtt_ms: number | null;
  model_override: PreferredAIModel | null; // auto-switched on degraded
  last_checked_at: number;                 // ms epoch
}

// ── Context Envelope ──────────────────────────────────────────────
// Sent with every AI call to personalise every single response

export interface CoachingContext {
  // Who the user is
  user_id: string;
  full_name: string | null;
  role: string | null;
  domain: string | null;
  experience_level: ExperienceLevel | null;
  years_of_experience: number | null;
  target_company: string | null;
  coach_tone: CoachTone;
  hint_style: HintStyle;

  // Resume intelligence
  resume_skills: string[];
  resume_projects: ResumeProject[];
  resume_experience_summary: string | null;
  jd_required_skills: string[];
  jd_seniority_signals: string[];
  gap_skills: string[];            // skills in JD but not in resume

  // Session-level performance so far
  session_goals: string[];         // e.g. ["reduce fillers", "improve STAR"]
  filler_words_to_watch: FillerWord[];
  current_filler_count: number;
  current_wpm: number;

  // Historical performance
  weak_areas: string[];            // from past sessions
  strong_areas: string[];
  last_3_answer_summaries: AnswerSummary[];
  avg_confidence_score: number;

  // Session config
  session_type: InterviewType;
  question_number: number;
  total_questions: number;

  // Extra document snippets (from context_document_ids)
  additional_context?: string[];

  // Live transcript context for hint generation
  last_transcript?: string | null;

  /** Wizard preference block (focus, avoid, emphasize, Answer Bank). */
  preference_context?: string | null;
  skills_to_emphasize?: string[];
  skills_not_to_claim?: string[];
  focus_competencies?: string[];
  topics_to_avoid?: string[];
  answer_bank_context_ids?: string[];
}

export interface ResumeProject {
  name: string;
  role: string;
  tech_stack: string[];
  impact_metric: string | null;
}

export interface AnswerSummary {
  question: string;
  score: number;
  key_weakness: string | null;
}

// ── AI Request / Response ─────────────────────────────────────────

export interface AIHintRequest {
  question_transcript: string;
  context: CoachingContext;
  hint_style: HintStyle;
  model: PreferredAIModel;
  is_coding_problem: boolean;
  screenshot_base64: string | null; // for vision-based coding problems
  session_id: string;
  question_id: string;
}

export interface AIHintChunk {
  type: "delta" | "done" | "error";
  content: string;
  finish_reason?: "stop" | "length" | "error";
}

export interface AIMockAnswerRequest {
  question: string;
  context: CoachingContext;
  model: PreferredAIModel;
  include_ideal_answer: boolean;
  session_id: string;
  question_id: string;
}

export interface AIScorecardRequest {
  session_id: string;
  questions: Array<{
    question_text: string;
    transcript: string;
    duration_seconds: number;
    filler_count: number;
    wpm_average: number;
  }>;
  context: CoachingContext;
}

export interface AICoachChatRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  context: CoachingContext;
  session_id: string;
  model: PreferredAIModel;
}

// ── Prep Lab AI Requests ──────────────────────────────────────────

export interface AIStarRequest {
  situation: string;
  task: string;
  action: string;
  result: string;
  target_role: string | null;
  context: Pick<CoachingContext, "role" | "experience_level" | "coach_tone">;
}

export interface AIProjectStoryRequest {
  project_name: string;
  your_role: string;
  tech_stack: string[];
  impact_metric: string;
  context: Pick<CoachingContext, "role" | "experience_level">;
}

export interface AIRephraseRequest {
  raw_answer: string;
  question: string;
  context: Pick<CoachingContext, "role" | "experience_level" | "coach_tone">;
}

export interface AICodingHintRequest {
  problem_text: string;
  language_preference: string | null;
}

export interface AICodingHintResponse {
  pattern: string;
  time_complexity: string;
  space_complexity: string;
  approach: string;
  edge_cases: string[];
  similar_problems: string[];
}

export interface AISystemDesignRequest {
  scenario: string;
  scale: "small" | "medium" | "large" | "massive";
  constraints: string[];
}

export interface AISystemDesignResponse {
  components: SystemDesignComponent[];
  database_recommendation: string;
  scaling_considerations: string[];
  trade_offs: TradeOff[];
  diagram_description: string;
}

export interface SystemDesignComponent {
  name: string;
  purpose: string;
  technology_options: string[];
}

export interface TradeOff {
  option_a: string;
  option_b: string;
  recommendation: string;
  reasoning: string;
}

// ── Resume Parsing ────────────────────────────────────────────────

export interface ParsedResume {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  skills: string[];
  tech_stack: string[];
  experience: ParsedExperience[];
  projects: ResumeProject[];
  education: ParsedEducation[];
  total_years_experience: number | null;
  seniority_signal: ExperienceLevel | null;
}

export interface ParsedExperience {
  company: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  duration_months: number | null;
  /** Human-readable tenure when parsed from resume text */
  duration?: string | null;
  description: string;
  impact_bullets: string[];
  tech_used: string[];
}

export interface ParsedEducation {
  institution: string;
  degree: string | null;
  field: string | null;
  graduation_year: number | null;
}

// ── JD Parsing ────────────────────────────────────────────────────

export interface ParsedJD {
  company_name: string | null;
  role_title: string;
  seniority_level: ExperienceLevel | null;
  required_skills: string[];
  preferred_skills: string[];
  keyword_frequency: Record<string, number>;
  responsibilities: string[];
  key_phrases: string[];
}

export interface GapAnalysisResult {
  missing_required_skills: string[];
  missing_preferred_skills: string[];
  matching_skills: string[];
  keywords_to_add: string[];
  likely_interview_topics: string[];
  match_score: number;             // 0–100
}

// ── Company Research ──────────────────────────────────────────────

export interface CompanyBrief {
  company_name: string;
  culture_signals: string[];
  engineering_reputation: string;
  interview_process: string;
  common_topics_by_role: Record<string, string[]>;
  values: string[];
  recent_news_summary: string | null;
  glassdoor_themes: string[];
  generated_at: string;
}

export interface CompanyQuestionPrediction {
  company: string;
  role: string;
  level: ExperienceLevel;
  predicted_questions: Array<{
    question: string;
    probability: "high" | "medium" | "low";
    category: InterviewType;
    reasoning: string;
  }>;
}

// ── Offline Fallback Templates ────────────────────────────────────

export interface OfflineTemplate {
  interview_type: InterviewType;
  hint_style: HintStyle;
  template: string;
  placeholder_fields: string[];    // e.g. ["{{role}}", "{{company}}"]
}
