
-- ============================================================
-- 1. FIX CRITICAL RLS POLICIES
-- ============================================================

-- SEC-1: user_achievements — restrict INSERT to authenticated users for their own user_id
DROP POLICY IF EXISTS "ua_insert" ON public.user_achievements;
CREATE POLICY "ua_insert" ON public.user_achievements
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- SEC-2: model_cost_logs — restrict INSERT to authenticated users for their own user_id
DROP POLICY IF EXISTS "model_cost_insert" ON public.model_cost_logs;
CREATE POLICY "model_cost_insert" ON public.model_cost_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- SEC-3: room_chat — scope reads to room participants only
DROP POLICY IF EXISTS "room_chat_all" ON public.room_chat;
CREATE POLICY "room_chat_select" ON public.room_chat
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_participants rp
      WHERE rp.room_id = room_chat.room_id AND rp.user_id = auth.uid()
    )
  );
CREATE POLICY "room_chat_insert" ON public.room_chat
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- SEC-4: room_questions — scope to room participants
DROP POLICY IF EXISTS "room_questions_all" ON public.room_questions;
CREATE POLICY "room_questions_select" ON public.room_questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_participants rp
      WHERE rp.room_id = room_questions.room_id AND rp.user_id = auth.uid()
    )
  );
CREATE POLICY "room_questions_insert" ON public.room_questions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.room_participants rp
      WHERE rp.room_id = room_questions.room_id AND rp.user_id = auth.uid()
    )
  );

-- ============================================================
-- 2. CREATE user_roles TABLE (SEC-5)
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write user_roles (using the new function below)
-- Bootstrap: we'll migrate existing is_admin users first

-- Seed existing admins into user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM public.profiles WHERE is_admin = true
ON CONFLICT DO NOTHING;

-- Create security definer function to check roles (no recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Update is_admin() to use user_roles table
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- RLS on user_roles: only admins can manage, authenticated can read own
CREATE POLICY "user_roles_admin" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_own_select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Prevent users from updating their own is_admin via profiles
-- We add a column-level restriction via trigger
CREATE OR REPLACE FUNCTION public.protect_admin_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Prevent non-admins from changing is_admin
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      NEW.is_admin := OLD.is_admin;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_profiles_admin
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_admin_column();

-- ============================================================
-- 3. FIX search_path ON FUNCTIONS (SEC-7)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_topic_performance(
  p_topic text, p_subject text, p_exam_type text,
  p_attempted_delta integer, p_correct_delta integer, p_avg_time_seconds numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.user_topic_performance (user_id, topic, subject, exam_type, total_attempted, total_correct, accuracy, avg_time_seconds, last_practiced, updated_at)
  VALUES (v_caller_id, p_topic, p_subject, COALESCE(p_exam_type, 'GENERAL'), p_attempted_delta, p_correct_delta,
    CASE WHEN p_attempted_delta > 0 THEN ROUND((p_correct_delta::DECIMAL / p_attempted_delta) * 100, 2) ELSE 0 END, p_avg_time_seconds, now(), now())
  ON CONFLICT (user_id, topic, exam_type) DO UPDATE SET
    total_attempted = user_topic_performance.total_attempted + EXCLUDED.total_attempted,
    total_correct = user_topic_performance.total_correct + EXCLUDED.total_correct,
    accuracy = CASE WHEN (user_topic_performance.total_attempted + EXCLUDED.total_attempted) > 0
      THEN ROUND(((user_topic_performance.total_correct + EXCLUDED.total_correct)::DECIMAL / (user_topic_performance.total_attempted + EXCLUDED.total_attempted)) * 100, 2) ELSE 0 END,
    avg_time_seconds = CASE WHEN user_topic_performance.avg_time_seconds IS NULL THEN EXCLUDED.avg_time_seconds
      ELSE ROUND((user_topic_performance.avg_time_seconds + EXCLUDED.avg_time_seconds) / 2, 2) END,
    last_practiced = now(), updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_streak()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_last DATE; v_today DATE := CURRENT_DATE;
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    SELECT last_active_date INTO v_last FROM profiles WHERE id = NEW.user_id;
    IF v_last IS NULL OR v_last < v_today - INTERVAL '1 day' THEN
      UPDATE profiles SET streak_days = 1, last_active_date = v_today,
        total_sessions = total_sessions + 1, xp = xp + 10, updated_at = NOW()
      WHERE id = NEW.user_id;
    ELSIF v_last = v_today - INTERVAL '1 day' THEN
      UPDATE profiles SET
        streak_days = streak_days + 1,
        longest_streak = GREATEST(longest_streak, streak_days + 1),
        last_active_date = v_today, total_sessions = total_sessions + 1,
        xp = xp + 15, updated_at = NOW()
      WHERE id = NEW.user_id;
    ELSE
      UPDATE profiles SET last_active_date = v_today,
        total_sessions = total_sessions + 1, xp = xp + 5, updated_at = NOW()
      WHERE id = NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, avatar_url, credits, created_at, updated_at
  ) VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url',
    50, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.subscriptions (user_id, plan_id, status, monthly_credits)
  VALUES (NEW.id, 'free', 'active', 50)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE notifications SET is_read = TRUE, read_at = NOW()
  WHERE user_id = p_user_id AND is_read = FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.add_credits(
  p_user_id uuid, p_amount integer,
  p_action credit_action DEFAULT 'purchase'::credit_action,
  p_description text DEFAULT NULL, p_payment_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_new INTEGER;
BEGIN
  UPDATE profiles SET credits = credits + p_amount, updated_at = NOW()
  WHERE id = p_user_id RETURNING credits INTO v_new;
  INSERT INTO credit_transactions (user_id, action, amount, balance_after, description, stripe_payment_id)
  VALUES (p_user_id, p_action, p_amount, v_new, p_description, p_payment_id);
  RETURN v_new;
END;
$$;

-- ============================================================
-- 4. DROP DUPLICATE deduct_credits (FUNC-1)
-- Keep the newer (p_action, p_cost, p_session_id) version, drop the old one
-- ============================================================
DROP FUNCTION IF EXISTS public.deduct_credits(uuid, integer, uuid, text);

-- ============================================================
-- 5. ADD INDEXES (DB-1, DB-2)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_questions_lookup ON public.questions(exam_type, difficulty, subject, topic);
CREATE INDEX IF NOT EXISTS idx_job_descriptions_user ON public.job_descriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_interviews_user ON public.scheduled_interviews(user_id);
CREATE INDEX IF NOT EXISTS idx_company_research_user ON public.company_research(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON public.feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_answers_user ON public.saved_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_scorecards_user ON public.scorecards(user_id);
CREATE INDEX IF NOT EXISTS idx_mock_tests_user ON public.mock_tests(user_id);
