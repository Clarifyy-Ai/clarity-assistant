// ─────────────────────────────────────────────────────────────────────────────
// supabase.types.ts — Database schema types matching Supabase tables,
// including Row, Insert, Update shapes for every table, and
// helper types for RLS, realtime, and storage.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Shared Primitives ────────────────────────────────────────────────────────

export type UUID    = string;
export type ISODate = string;    // "2026-03-19T07:08:00.000Z"
export type JSONB   = Record<string, unknown>;

// ─── Table: profiles ──────────────────────────────────────────────────────────

export interface ProfileRow {
  id:                 UUID;
  email:              string;
  full_name:          string | null;
  avatar_url:         string | null;
  plan_id:            string;
  credits:            number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  subscription_ends_at: ISODate | null;
  byok_openai:        string | null;   // encrypted
  byok_anthropic:     string | null;   // encrypted
  byok_gemini:        string | null;   // encrypted
  preferred_model:    string | null;
  preferred_language: string | null;
  timezone:           string | null;
  ui_preferences:     JSONB | null;
  overlay_settings:   JSONB | null;
  hotkey_overrides:   JSONB | null;
  onboarding_completed: boolean;
  is_admin:           boolean;
  created_at:         ISODate;
  updated_at:         ISODate;
}

export interface ProfileInsert extends Partial<Omit<ProfileRow, "id" | "created_at" | "updated_at">> {
  id:    UUID;
  email: string;
}

export interface ProfileUpdate extends Partial<Omit<ProfileRow, "id" | "created_at">> {
  updated_at?: ISODate;
}

// ─── Table: sessions ──────────────────────────────────────────────────────────

export interface SessionRow {
  id:                UUID;
  user_id:           UUID;
  title:             string | null;
  mode:              "live" | "mock" | "self" | "prep";
  status:            "active" | "paused" | "ended" | "error";
  interview_type:    string | null;
  company:           string | null;
  role:              string | null;
  job_description:   string | null;
  resume_id:         UUID | null;
  transcript:        string | null;
  question_count:    number;
  duration_seconds:  number | null;
  overall_score:     number | null;
  debrief:           JSONB | null;
  model_used:        string | null;
  credits_used:      number;
  metadata:          JSONB | null;
  started_at:        ISODate;
  paused_at:         ISODate | null;
  ended_at:          ISODate | null;
  created_at:        ISODate;
  updated_at:        ISODate;
}

export interface SessionInsert extends Partial<Omit<SessionRow, "id" | "created_at" | "updated_at">> {
  user_id:    UUID;
  started_at: ISODate;
}

export interface SessionUpdate extends Partial<Omit<SessionRow, "id" | "user_id" | "created_at">> {
  updated_at?: ISODate;
}

// ─── Table: session_questions ─────────────────────────────────────────────────

export interface SessionQuestionRow {
  id:              UUID;
  session_id:      UUID;
  user_id:         UUID;
  question_text:   string;
  answer_text:     string | null;
  hint_text:       string | null;
  feedback:        JSONB | null;
  score:           number | null;
  model_used:      string | null;
  credits_used:    number;
  detected_at_ms:  number;
  answered_at_ms:  number | null;
  created_at:      ISODate;
}

export interface SessionQuestionInsert extends Partial<Omit<SessionQuestionRow, "id" | "created_at">> {
  session_id:     UUID;
  user_id:        UUID;
  question_text:  string;
  detected_at_ms: number;
}

// ─── Table: answers (answer bank) ────────────────────────────────────────────

export interface AnswerRow {
  id:              UUID;
  user_id:         UUID;
  question_text:   string;
  answer_text:     string;
  star_situation:  string | null;
  star_task:       string | null;
  star_action:     string | null;
  star_result:     string | null;
  interview_type:  string | null;
  company:         string | null;
  role:            string | null;
  tags:            string[];
  model_used:      string | null;
  score:           number | null;
  is_favourite:    boolean;
  times_used:      number;
  last_used_at:    ISODate | null;
  source:          "ai" | "manual" | "session";
  session_id:      UUID | null;
  created_at:      ISODate;
  updated_at:      ISODate;
}

export interface AnswerInsert extends Partial<Omit<AnswerRow, "id" | "created_at" | "updated_at">> {
  user_id:      UUID;
  question_text: string;
  answer_text:  string;
}

export interface AnswerUpdate extends Partial<Omit<AnswerRow, "id" | "user_id" | "created_at">> {
  updated_at?: ISODate;
}

// ─── Table: documents (resumes) ───────────────────────────────────────────────

export interface DocumentRow {
  id:              UUID;
  user_id:         UUID;
  name:            string;
  type:            "resume" | "cover_letter" | "portfolio" | "other";
  format:          "pdf" | "docx" | "doc" | "txt";
  size_bytes:      number;
  storage_path:    string;
  public_url:      string | null;
  extracted_text:  string | null;
  word_count:      number | null;
  analysis:        JSONB | null;    // AI analysis result
  ats_score:       number | null;
  is_primary:      boolean;
  is_active:       boolean;
  created_at:      ISODate;
  updated_at:      ISODate;
}

export interface DocumentInsert extends Partial<Omit<DocumentRow, "id" | "created_at" | "updated_at">> {
  user_id:      UUID;
  name:         string;
  type:         DocumentRow["type"];
  format:       DocumentRow["format"];
  size_bytes:   number;
  storage_path: string;
}

// ─── Table: credit_transactions ───────────────────────────────────────────────

export interface CreditTransactionRow {
  id:              UUID;
  user_id:         UUID;
  amount:          number;     // positive = added, negative = deducted
  balance_after:   number;
  type:            "deduction" | "purchase" | "plan_grant" | "bonus" | "refund";
  feature?:        string;     // which feature caused the deduction
  model?:          string;
  session_id?:     UUID;
  stripe_payment_intent?: string;
  description:     string;
  created_at:      ISODate;
}

export interface CreditTransactionInsert extends Partial<Omit<CreditTransactionRow, "id" | "created_at">> {
  user_id:       UUID;
  amount:        number;
  balance_after: number;
  type:          CreditTransactionRow["type"];
  description:   string;
}

// ─── Table: notifications ─────────────────────────────────────────────────────

export interface NotificationRow {
  id:          UUID;
  user_id:     UUID;
  type:        string;
  title:       string;
  body:        string;
  data:        JSONB | null;
  is_read:     boolean;
  read_at:     ISODate | null;
  action_url:  string | null;
  created_at:  ISODate;
}

export interface NotificationInsert extends Partial<Omit<NotificationRow, "id" | "created_at">> {
  user_id: UUID;
  type:    string;
  title:   string;
  body:    string;
}

// ─── Table: analytics_events ─────────────────────────────────────────────────

export interface AnalyticsEventRow {
  id:          UUID;
  user_id:     UUID | null;
  session_id:  UUID | null;
  event_name:  string;
  properties:  JSONB;
  device:      JSONB | null;
  ip_hash:     string | null;
  created_at:  ISODate;
}

// ─── Table: feedback (user-submitted) ────────────────────────────────────────

export interface FeedbackRow {
  id:         UUID;
  user_id:    UUID | null;
  type:       "bug" | "feature" | "general" | "nps";
  rating:     number | null;    // 1–10
  message:    string;
  metadata:   JSONB | null;
  created_at: ISODate;
}

// ─── Table: interview_prep ────────────────────────────────────────────────────

export interface InterviewPrepRow {
  id:              UUID;
  user_id:         UUID;
  company:         string;
  role:            string;
  interview_date:  ISODate | null;
  job_description: string | null;
  notes:           string | null;
  research:        JSONB | null;   // company research result
  prep_questions:  string[];
  status:          "pending" | "in_progress" | "completed";
  created_at:      ISODate;
  updated_at:      ISODate;
}

// ─── Full Database Schema ─────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      profiles:             { Row: ProfileRow;             Insert: ProfileInsert;             Update: ProfileUpdate };
      sessions:             { Row: SessionRow;             Insert: SessionInsert;             Update: SessionUpdate };
      session_questions:    { Row: SessionQuestionRow;     Insert: SessionQuestionInsert;     Update: Partial<SessionQuestionRow> };
      answers:              { Row: AnswerRow;              Insert: AnswerInsert;              Update: AnswerUpdate };
      documents:            { Row: DocumentRow;            Insert: DocumentInsert;            Update: Partial<DocumentRow> };
      credit_transactions:  { Row: CreditTransactionRow;  Insert: CreditTransactionInsert;   Update: never };
      notifications:        { Row: NotificationRow;       Insert: NotificationInsert;        Update: Partial<NotificationRow> };
      analytics_events:     { Row: AnalyticsEventRow;     Insert: Omit<AnalyticsEventRow, "id">; Update: never };
      feedback:             { Row: FeedbackRow;            Insert: Omit<FeedbackRow, "id" | "created_at">; Update: never };
      interview_prep:       { Row: InterviewPrepRow;       Insert: Partial<InterviewPrepRow> & { user_id: UUID; company: string; role: string }; Update: Partial<InterviewPrepRow> };
    };
    Views:     Record<string, never>;
    Functions: Record<string, never>;
    Enums:     Record<string, never>;
  };
}

// ─── Supabase Client Helpers ──────────────────────────────────────────────────

export type TableName = keyof Database["public"]["Tables"];

export type TableRow<T extends TableName> =
  Database["public"]["Tables"][T]["Row"];

export type TableInsert<T extends TableName> =
  Database["public"]["Tables"][T]["Insert"];

export type TableUpdate<T extends TableName> =
  Database["public"]["Tables"][T]["Update"];

// ─── Realtime ────────────────────────────────────────────────────────────────

export type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE";

export interface RealtimePayload<T> {
  eventType: RealtimeEvent;
  new:       T;
  old:       Partial<T>;
  schema:    "public";
  table:     TableName;
  commit_timestamp: ISODate;
}

// ─── Storage Buckets ──────────────────────────────────────────────────────────

export type StorageBucket =
  | "resumes"
  | "avatars"
  | "session-recordings"
  | "exports";

export interface StorageObject {
  id:          UUID;
  name:        string;
  bucket_id:   StorageBucket;
  owner:       UUID;
  size:        number;
  mime_type:   string;
  created_at:  ISODate;
  updated_at:  ISODate;
}

// ─── Supabase Auth ────────────────────────────────────────────────────────────

export interface SupabaseUser {
  id:             UUID;
  email:          string;
  email_confirmed_at?: ISODate;
  phone?:         string;
  created_at:     ISODate;
  updated_at:     ISODate;
  last_sign_in_at?: ISODate;
  app_metadata:   Record<string, unknown>;
  user_metadata:  Record<string, unknown>;
}

export interface SupabaseSession {
  access_token:  string;
  refresh_token: string;
  expires_at:    number;
  expires_in:    number;
  token_type:    "bearer";
  user:          SupabaseUser;
}

export type AuthProvider =
  | "email"
  | "google"
  | "github"
  | "linkedin_oidc"
  | "azure";
