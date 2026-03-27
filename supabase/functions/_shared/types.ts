// ─────────────────────────────────────────────────────────────────────────────
// _shared/types.ts — Production‑Ready Shared Types for All Edge Functions
// Hardened, normalized, future‑proof.
// Deno runtime compatible — no Node imports.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Auth Context ─────────────────────────────────────────────────────────────

export interface AuthContext {
  userId:     string;
  email:      string;
  planId:     string;
  credits:    number;
  isAdmin:    boolean;
}

// ─── Generic Response Envelope ───────────────────────────────────────────────

export interface EdgeSuccess<T = unknown> {
  success: true;
  data:    T;
  meta?:   ResponseMeta;
}

export interface EdgeError {
  success: false;
  error:   string;
  code:    string; // machine-friendly error code
}

export type EdgeResponse<T = unknown> = EdgeSuccess<T> | EdgeError;

export interface ResponseMeta {
  model?:          string;
  tokensUsed?:     number;
  creditsCharged?: number;
  cached?:         boolean;
  latencyMs?:      number;
}

// ─── AI Models / Providers ───────────────────────────────────────────────────

export type AIProvider = "openai" | "anthropic" | "gemini";

export type ModelId =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-4-turbo"
  | "claude-3-5-sonnet-20241022"
  | "claude-3-haiku-20240307"
  | "gemini-2.0-flash"
  | "gemini-1.5-pro";

export interface ModelConfig {
  id:           ModelId;
  provider:     AIProvider;
  maxTokens:    number;
  temperature:  number;
}

export interface ChatMessage {
  role:    "system" | "user" | "assistant";
  content: string;
}

export interface AICompletionRequest {
  model:        ModelId;
  messages:     ChatMessage[];
  maxTokens?:   number;
  temperature?: number;
  stream?:      boolean;
}

export interface AICompletionResponse {
  text:         string;
  model:        ModelId;
  tokensIn:     number;
  tokensOut:    number;
  totalTokens:  number;
  latencyMs:    number;
}

// ─── Credit System ───────────────────────────────────────────────────────────

export interface CreditDeductionResult {
  success:      boolean;
  balanceAfter: number;
  error?:       string;
}

export type FeatureKey =
  | "generate_answer"
  | "generate_hint"
  | "generate_feedback"
  | "generate_star"
  | "generate_debrief"
  | "coach_message"
  | "company_research"
  | "resume_analysis"
  | "rephrase"
  | "schedule_interview"
  | "polish_star";

export const CREDIT_COSTS: Record<FeatureKey, number> = {
  generate_answer:    2,
  generate_hint:      1,
  generate_feedback:  3,
  generate_star:      2,
  generate_debrief:   5,
  coach_message:      2,
  company_research:   3,
  resume_analysis:    5,
  rephrase:           1,
  schedule_interview: 1,
  polish_star:        1,
};

// ─── STAR Framework ──────────────────────────────────────────────────────────

export interface STARAnswer {
  situation:   string;
  task:        string;
  action:      string;
  result:      string;
  fullAnswer:  string;
}

export interface STARSection {
  key:     keyof Omit<STARAnswer, "fullAnswer">;
  label:   string;
  content: string;
}

// ─── Interview Scheduling ─────────────────────────────────────────────────────

export type InterviewRound =
  | "phone_screen"
  | "technical"
  | "system_design"
  | "behavioral"
  | "hr"
  | "final"
  | "offer";

export interface ReminderConfig {
  minutesBefore: number;
  channel:       "email" | "push" | "both";
}

export interface InterviewEvent {
  id:           string;
  userId:       string;
  company:      string;
  role:         string;
  round:        InterviewRound;
  scheduledAt:  string;  // ISO string
  durationMin:  number;
  location?:    string;  // URL or physical room
  notes?:       string;
  reminders:    ReminderConfig[];
  createdAt:    string;  // ISO
}

// ─── Emails ──────────────────────────────────────────────────────────────────

export type EmailTemplate =
  | "welcome"
  | "interview_reminder"
  | "low_credits"
  | "session_debrief"
  | "password_reset"
  | "plan_upgraded"
  | "account_deleted";

export interface EmailPayload {
  to:       string;
  template: EmailTemplate;
  data:     Record<string, unknown>;
}

// ─── Validation Utilities ─────────────────────────────────────────────────────

export interface ValidationError {
  field:   string;
  message: string;
}

export interface ValidationResult {
  valid:   boolean;
  errors:  ValidationError[];
}
