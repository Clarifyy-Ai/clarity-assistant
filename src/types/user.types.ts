// ─────────────────────────────────────────────────────────────────
// User & Profile Types
// ─────────────────────────────────────────────────────────────────

/** Launch surface: free | pro | enterprise. `team` is a legacy DB alias only. */
export type UserPlan = "free" | "pro" | "team" | "enterprise";

export type UserRole =
  | "software_engineer"
  | "frontend_engineer"
  | "backend_engineer"
  | "fullstack_engineer"
  | "devops_engineer"
  | "data_scientist"
  | "ml_engineer"
  | "product_manager"
  | "engineering_manager"
  | "designer"
  | "qa_engineer"
  | "other";

export type ExperienceLevel =
  | "intern"
  | "junior"
  | "mid"
  | "senior"
  | "staff"
  | "principal"
  | "director"
  | "vp";

export type CoachTone = "encouraging" | "direct" | "formal" | "casual";

export type HintStyle = "full_answer" | "short_hints" | "keywords_only";

export type PreferredAIModel =
  | "gemini-flash"
  | "gemini-pro"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "claude"
  | "claude-3-5-sonnet"
  | "claude-3-haiku"
  | "gemini-1-5-pro"
  | "gemini-1-5-flash";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;

  // Role & experience
  role: UserRole | null;
  domain: string | null;             // e.g. "fintech", "enterprise saas"
  experience_level: ExperienceLevel | null;
  years_of_experience: number | null;
  target_companies: string[];        // ["Google", "Amazon", ...]
  interview_anxiety_score: number | null; // 1–5 self-reported

  // Preferences
  preferred_model: PreferredAIModel;
  hint_style: HintStyle;
  coach_tone: CoachTone;

  // Plan & credits
  plan: UserPlan;
  /** Supabase profiles.plan_id — preferred at runtime */
  plan_id?: string | null;
  credits: number;
  credits_used_this_month: number;
  credits_reset_at: string | null;   // ISO datetime

  // Stripe
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status:
    | "active"
    | "past_due"
    | "canceled"
    | "trialing"
    | null;
  subscription_period_end: string | null;

  // Gamification
  xp: number;
  streak_current: number;
  streak_longest: number;
  streak_last_activity_date: string | null; // ISO date
  badges: string[];                  // badge IDs

  // Onboarding
  onboarding_completed: boolean;
  mfa_reenrollment_required?: boolean;
  onboarding_step: number;           // 1–5

  // Privacy
  is_leaderboard_visible: boolean;
  data_retention_days: number | null; // null = keep forever
  privacy_mode_default: boolean;

  // Admin (derived from user_roles table, not stored on profile)


  // Referral
  referral_code: string | null;
  referred_by: string | null;        // referral code used
  referral_credits_earned: number;

  // BYOK — bring your own API keys (stored encrypted server-side)
  byok_gemini: boolean;
  byok_openai: boolean;
  byok_anthropic: boolean;

  // Timestamps
  created_at: string;
  updated_at: string;
}

// ── Onboarding ────────────────────────────────────────────────────

export interface OnboardingStep1Data {
  full_name: string;
  role: UserRole;
  domain: string;
}

export interface OnboardingStep2Data {
  experience_level: ExperienceLevel;
  years_of_experience: number;
  target_companies: string[];
  interview_anxiety_score: number; // 1–5
}

export interface OnboardingStep3Data {
  preferred_model: PreferredAIModel;
  hint_style: HintStyle;
  coach_tone: CoachTone;
}

export interface OnboardingStep4Data {
  mic_device_id: string | null;
  system_audio_confirmed: boolean;
}

export interface OnboardingStep5Data {
  resume_uploaded: boolean;
  resume_id: string | null;
}

// ── Team / Rooms ──────────────────────────────────────────────────

export interface TeamMember {
  id: string;
  user_id: string;
  team_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
  profile: Pick<UserProfile, "id" | "full_name" | "avatar_url" | "role">;
}

// ── Notifications ─────────────────────────────────────────────────

export type NotificationType =
  | "streak_alert"
  | "badge_unlock"
  | "weekly_summary"
  | "interview_reminder"
  | "debrief_nudge"
  | "room_invitation"
  | "credit_low"
  | "session_complete"
  | "referral_converted";

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  is_read: boolean;
  action_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ── Referral ──────────────────────────────────────────────────────

export interface ReferralStats {
  referral_code: string;
  total_referred: number;
  converted: number;
  pending: number;
  credits_earned: number;
  referrals: ReferralEntry[];
}

export interface ReferralEntry {
  id: string;
  referred_email: string;
  status: "pending" | "signed_up" | "converted";
  credits_awarded: number;
  created_at: string;
}

// ── Auth ──────────────────────────────────────────────────────────

export interface AuthState {
  session: import("@supabase/supabase-js").Session | null;
  user: import("@supabase/supabase-js").User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}
