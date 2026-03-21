-- ═══════════════════════════════════════════════════════════════
-- Migration: add_missing_tables
-- Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- Run this in the Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Patch profiles — add any columns missing from the live DB ────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS domain                  TEXT,
  ADD COLUMN IF NOT EXISTS experience_level        TEXT,
  ADD COLUMN IF NOT EXISTS years_of_experience     INTEGER,
  ADD COLUMN IF NOT EXISTS target_companies        TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS interview_anxiety_score INTEGER,
  ADD COLUMN IF NOT EXISTS hint_style              TEXT    NOT NULL DEFAULT 'short_hints',
  ADD COLUMN IF NOT EXISTS coach_tone              TEXT    NOT NULL DEFAULT 'encouraging',
  ADD COLUMN IF NOT EXISTS credits_used_this_month INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_reset_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_customer_id      TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status     TEXT,
  ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS xp                      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_current          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_longest          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_last_activity_date DATE,
  ADD COLUMN IF NOT EXISTS badges                  TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarding_step         INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_leaderboard_visible  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS data_retention_days     INTEGER,
  ADD COLUMN IF NOT EXISTS privacy_mode_default    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS referral_code           TEXT,
  ADD COLUMN IF NOT EXISTS referred_by             TEXT,
  ADD COLUMN IF NOT EXISTS referral_credits_earned INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS byok_gemini             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS byok_openai             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS byok_anthropic          BOOLEAN NOT NULL DEFAULT FALSE;

-- Make referral_code unique (ignore if constraint already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_referral_code_key'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_referral_code_key UNIQUE (referral_code);
  END IF;
END$$;

-- ─── 2. Patch sessions — add extra columns the UI expects ────────────────────

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS session_type   TEXT,
  ADD COLUMN IF NOT EXISTS interview_type TEXT,
  ADD COLUMN IF NOT EXISTS target_company TEXT,
  ADD COLUMN IF NOT EXISTS overall_score  INTEGER,
  ADD COLUMN IF NOT EXISTS question_count INTEGER,
  ADD COLUMN IF NOT EXISTS summary        TEXT;

-- ─── 3. answer_bank ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.answer_bank (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_text  TEXT NOT NULL,
  answer_text    TEXT NOT NULL,
  category       TEXT,
  source         TEXT DEFAULT 'manual',
  tags           TEXT[] DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.answer_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own answer bank"
  ON public.answer_bank FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 4. analytics ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.analytics (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  session_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can insert own analytics"
  ON public.analytics FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can read own analytics"
  ON public.analytics FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ─── 5. company_research ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.company_research (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  role_title   TEXT,
  overview     TEXT,
  culture      TEXT,
  prep_tips    TEXT,
  raw_data     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.company_research ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own company research"
  ON public.company_research FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 6. documents (resumes, cover letters, JDs) ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.documents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL DEFAULT 'resume',  -- resume | cover_letter | job_description
  name       TEXT NOT NULL,
  content    TEXT,
  url        TEXT,
  file_path  TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own documents"
  ON public.documents FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 7. job_descriptions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.job_descriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  company      TEXT,
  content      TEXT,
  url          TEXT,
  target_role  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.job_descriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own job descriptions"
  ON public.job_descriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 8. resumes ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.resumes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  file_path  TEXT,
  url        TEXT,
  content    TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own resumes"
  ON public.resumes FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 9. feedback ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  rating     INTEGER CHECK (rating BETWEEN 1 AND 5),
  content    TEXT,
  category   TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own feedback"
  ON public.feedback FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 10. scorecards ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scorecards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id     UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  overall_score  INTEGER CHECK (overall_score BETWEEN 0 AND 100),
  communication  INTEGER,
  technical      INTEGER,
  problem_solving INTEGER,
  confidence     INTEGER,
  feedback       TEXT,
  strengths      TEXT[] DEFAULT '{}',
  improvements   TEXT[] DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.scorecards ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own scorecards"
  ON public.scorecards FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 11. session_answers ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.session_answers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id   UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
  question     TEXT NOT NULL,
  answer       TEXT,
  score        INTEGER,
  ai_feedback  TEXT,
  duration_ms  INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.session_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own session answers"
  ON public.session_answers FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 12. session_debriefs ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.session_debriefs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
  overall_grade   TEXT,
  priority_focus  TEXT,
  strengths       TEXT[] DEFAULT '{}',
  improvements    TEXT[] DEFAULT '{}',
  detailed_report JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.session_debriefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own debriefs"
  ON public.session_debriefs FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 13. transcripts ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.transcripts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id   UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
  content      TEXT,
  utterances   JSONB DEFAULT '[]',
  wpm_data_points JSONB DEFAULT '[]',
  filler_occurrences JSONB DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own transcripts"
  ON public.transcripts FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 14. notifications ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL DEFAULT 'info',
  title      TEXT NOT NULL,
  body       TEXT,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  action_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own notifications"
  ON public.notifications FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 15. feature_flags ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Anyone can read feature flags"
  ON public.feature_flags FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY IF NOT EXISTS "Admins can manage feature flags"
  ON public.feature_flags FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ─── 16. user_badges ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_badges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id   TEXT NOT NULL,
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, badge_id)
);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own badges"
  ON public.user_badges FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 17. weekly_challenges ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.weekly_challenges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  reward_xp   INTEGER NOT NULL DEFAULT 0,
  progress    INTEGER NOT NULL DEFAULT 0,
  goal        INTEGER NOT NULL DEFAULT 1,
  completed   BOOLEAN NOT NULL DEFAULT FALSE,
  week_start  TIMESTAMPTZ NOT NULL,
  week_end    TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.weekly_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own weekly challenges"
  ON public.weekly_challenges FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 18. scheduled_interviews ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scheduled_interviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name    TEXT NOT NULL,
  role_title      TEXT NOT NULL,
  stage           TEXT NOT NULL DEFAULT 'phone_screen',
  priority        TEXT NOT NULL DEFAULT 'medium',
  is_remote       BOOLEAN NOT NULL DEFAULT TRUE,
  location        TEXT,
  job_posting_url TEXT,
  salary_range    TEXT,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'upcoming',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.scheduled_interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own scheduled interviews"
  ON public.scheduled_interviews FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 19. interview_rounds ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.interview_rounds (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_interview_id UUID NOT NULL REFERENCES public.scheduled_interviews(id) ON DELETE CASCADE,
  round_number           INTEGER NOT NULL DEFAULT 1,
  round_type             TEXT,
  scheduled_at           TIMESTAMPTZ,
  duration_minutes       INTEGER,
  interviewer_name       TEXT,
  interviewer_title      TEXT,
  notes                  TEXT,
  outcome                TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.interview_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own interview rounds"
  ON public.interview_rounds FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.scheduled_interviews si
    WHERE si.id = scheduled_interview_id AND si.user_id = auth.uid()
  ));

-- ─── 20. practice_rooms ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.practice_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'waiting',
  max_players INTEGER NOT NULL DEFAULT 2,
  is_public   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.practice_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Anyone can read public practice rooms"
  ON public.practice_rooms FOR SELECT TO authenticated
  USING (is_public = TRUE OR host_id = auth.uid());

CREATE POLICY IF NOT EXISTS "Hosts can manage their rooms"
  ON public.practice_rooms FOR ALL TO authenticated
  USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

-- ─── 21. room_participants ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.room_participants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID NOT NULL REFERENCES public.practice_rooms(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'participant',
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);

ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Participants can see room members"
  ON public.room_participants FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY IF NOT EXISTS "Users can join rooms"
  ON public.room_participants FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ─── 22. room_chat ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.room_chat (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID NOT NULL REFERENCES public.practice_rooms(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.room_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Room participants can read/write chat"
  ON public.room_chat FOR ALL TO authenticated
  USING (TRUE)
  WITH CHECK (auth.uid() = user_id);

-- ─── 23. room_questions ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.room_questions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID NOT NULL REFERENCES public.practice_rooms(id) ON DELETE CASCADE,
  question     TEXT NOT NULL,
  question_type TEXT DEFAULT 'behavioral',
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.room_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Room members can manage questions"
  ON public.room_questions FOR ALL TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

-- ─── 24. subscriptions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan                   TEXT NOT NULL DEFAULT 'free',
  status                 TEXT NOT NULL DEFAULT 'active',
  stripe_subscription_id TEXT,
  stripe_customer_id     TEXT,
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can read own subscriptions"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ─── 25. calendar_integrations ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.calendar_integrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL DEFAULT 'google',
  access_token  TEXT,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own calendar integrations"
  ON public.calendar_integrations FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 26. saved_answers ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.saved_answers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  tags          TEXT[] DEFAULT '{}',
  category      TEXT DEFAULT 'general',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.saved_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own saved answers"
  ON public.saved_answers FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 27. credits table (separate ledger) ─────────────────────────────────────
-- Note: primary credits balance lives in profiles.credits
-- This table is for a more granular per-user credits ledger if needed.

CREATE TABLE IF NOT EXISTS public.credits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  balance     INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent  INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can read own credits"
  ON public.credits FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ─── 28. RLS enable for original tables (safe if already enabled) ────────────

ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_context     ENABLE ROW LEVEL SECURITY;
