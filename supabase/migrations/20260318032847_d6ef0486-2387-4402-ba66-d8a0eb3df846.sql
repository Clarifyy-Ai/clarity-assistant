
-- ═══════════════════════════════════════════════════════════════
-- Core Tables for ConfideQ
-- ═══════════════════════════════════════════════════════════════

-- 1. Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  
  -- Role & experience
  role TEXT,
  domain TEXT,
  experience_level TEXT,
  years_of_experience INTEGER,
  target_companies TEXT[] DEFAULT '{}',
  interview_anxiety_score INTEGER,
  
  -- Preferences
  preferred_model TEXT NOT NULL DEFAULT 'gemini-flash',
  hint_style TEXT NOT NULL DEFAULT 'short_hints',
  coach_tone TEXT NOT NULL DEFAULT 'encouraging',
  
  -- Plan & credits
  plan TEXT NOT NULL DEFAULT 'free',
  credits INTEGER NOT NULL DEFAULT 5,
  credits_used_this_month INTEGER NOT NULL DEFAULT 0,
  credits_reset_at TIMESTAMPTZ,
  
  -- Stripe
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT,
  subscription_period_end TIMESTAMPTZ,
  
  -- Gamification
  xp INTEGER NOT NULL DEFAULT 0,
  streak_current INTEGER NOT NULL DEFAULT 0,
  streak_longest INTEGER NOT NULL DEFAULT 0,
  streak_last_activity_date DATE,
  badges TEXT[] DEFAULT '{}',
  
  -- Onboarding
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_step INTEGER NOT NULL DEFAULT 1,
  
  -- Privacy
  is_leaderboard_visible BOOLEAN NOT NULL DEFAULT TRUE,
  data_retention_days INTEGER,
  privacy_mode_default BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Admin
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Referral
  referral_code TEXT UNIQUE,
  referred_by TEXT,
  referral_credits_earned INTEGER NOT NULL DEFAULT 0,
  
  -- BYOK
  byok_gemini BOOLEAN NOT NULL DEFAULT FALSE,
  byok_openai BOOLEAN NOT NULL DEFAULT FALSE,
  byok_anthropic BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS for profiles
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2. Sessions
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'mock',
  status TEXT NOT NULL DEFAULT 'idle',
  config JSONB,
  transcript_full TEXT,
  model_used TEXT,
  credits_consumed INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  is_privacy_mode BOOLEAN NOT NULL DEFAULT FALSE,
  room_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE POLICY "Users can read own sessions"
  ON public.sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON public.sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON public.sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Credit Transactions
CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  action TEXT NOT NULL,
  model TEXT,
  session_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE POLICY "Users can read own credit transactions"
  ON public.credit_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own credit transactions"
  ON public.credit_transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4. Coaching Context (persistent across sessions)
CREATE TABLE public.coaching_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weak_areas TEXT[] DEFAULT '{}',
  strong_areas TEXT[] DEFAULT '{}',
  filler_words_to_watch TEXT[] DEFAULT '{}',
  avg_confidence_score NUMERIC NOT NULL DEFAULT 0,
  total_sessions INTEGER NOT NULL DEFAULT 0,
  last_session_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE POLICY "Users can read own coaching context"
  ON public.coaching_context FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own coaching context"
  ON public.coaching_context FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own coaching context"
  ON public.coaching_context FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- 5. Deduct credits RPC
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_action TEXT,
  p_cost INTEGER,
  p_session_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_current INTEGER;
BEGIN
  SELECT credits INTO v_current FROM profiles WHERE id = v_user_id FOR UPDATE;
  
  IF v_current IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;
  
  IF v_current < p_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient credits', 'new_balance', v_current);
  END IF;
  
  UPDATE profiles
    SET credits = credits - p_cost,
        credits_used_this_month = credits_used_this_month + p_cost,
        updated_at = NOW()
    WHERE id = v_user_id;
  
  INSERT INTO credit_transactions (user_id, amount, action, session_id)
    VALUES (v_user_id, -p_cost, p_action, p_session_id);
  
  RETURN jsonb_build_object('success', true, 'new_balance', v_current - p_cost);
END;
$$;
