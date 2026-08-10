-- AI Hub: test runs, results, cache, spend budgets, free-tier usage,
-- acceleration settings, routing policy overrides.
-- Tenancy: platform-level settings + per-user quotas (no organizations table).

-- ── Spend / hub settings (singleton-style platform row + optional keys) ──────
CREATE TABLE IF NOT EXISTS public.ai_hub_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_hub_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_hub_settings_admin_select"
  ON public.ai_hub_settings FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "ai_hub_settings_admin_write"
  ON public.ai_hub_settings FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Defaults (ops USD budgets in micro-USD: $1 = 1_000_000)
INSERT INTO public.ai_hub_settings (key, value) VALUES
  ('budgets', jsonb_build_object(
    'daily_budget_micro_usd', 2000000,
    'monthly_budget_micro_usd', 20000000,
    'max_request_cost_micro_usd', 100000,
    'max_output_tokens', 2000,
    'rate_limit_per_minute', 10,
    'rate_limit_per_hour', 100
  )),
  ('cache', jsonb_build_object('enabled', true, 'ttl_seconds', 86400)),
  ('free_tier', jsonb_build_object(
    'enabled', true,
    'daily_tokens', 250000,
    'eligible_tiers', jsonb_build_array('cheap')
  )),
  ('routing', jsonb_build_object('enabled', true)),
  ('acceleration', jsonb_build_object(
    'priority_tier', 'standard',
    'max_output_tokens_ceiling', 5000,
    'concurrent_request_ceiling', 5
  )),
  ('provider_mode', '"mock"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── Free daily token allowance (per user, UTC day bucket) ───────────────────
CREATE TABLE IF NOT EXISTS public.ai_free_tier_usage (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT (timezone('utc', now()))::date,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  tokens_limit INTEGER NOT NULL DEFAULT 250000,
  model_class TEXT NOT NULL DEFAULT 'flash_equivalent',
  last_reset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date, model_class)
);

CREATE INDEX IF NOT EXISTS idx_ai_free_tier_user_date
  ON public.ai_free_tier_usage (user_id, usage_date DESC);

ALTER TABLE public.ai_free_tier_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_free_tier_own_select"
  ON public.ai_free_tier_usage FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- Writes via service role only (edge)

-- ── Acceleration settings (platform scope for v1) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_acceleration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'platform' CHECK (scope IN ('platform', 'user')),
  scope_id UUID NULL,
  priority_tier TEXT NOT NULL DEFAULT 'standard'
    CHECK (priority_tier IN ('throttled', 'standard', 'accelerated')),
  max_output_tokens_ceiling INTEGER NOT NULL DEFAULT 5000,
  concurrent_request_ceiling INTEGER NOT NULL DEFAULT 5,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, scope_id)
);

ALTER TABLE public.ai_acceleration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_accel_admin_select"
  ON public.ai_acceleration_settings FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "ai_accel_admin_write"
  ON public.ai_acceleration_settings FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.ai_acceleration_settings (scope, scope_id, priority_tier)
VALUES ('platform', NULL, 'standard')
ON CONFLICT (scope, scope_id) DO NOTHING;

-- ── Routing policy overrides ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_routing_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type TEXT NOT NULL,
  preferred_provider TEXT NOT NULL CHECK (preferred_provider IN ('openai', 'gemini', 'anthropic')),
  preferred_model TEXT NOT NULL,
  fallback_chain TEXT[] NOT NULL DEFAULT '{}',
  max_output_tokens_default INTEGER NOT NULL DEFAULT 2000,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_type)
);

ALTER TABLE public.ai_routing_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_routing_admin_all"
  ON public.ai_routing_policy FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.ai_routing_policy
  (task_type, preferred_provider, preferred_model, fallback_chain, max_output_tokens_default)
VALUES
  ('short_qa', 'gemini', 'gemini-2.5-flash', ARRAY['gemini-2.5-flash','gpt-4o-mini','claude-3-haiku-20240307'], 500),
  ('summarize', 'gemini', 'gemini-2.5-flash', ARRAY['gemini-2.5-flash','gpt-4o-mini'], 1000),
  ('extract_json', 'gemini', 'gemini-2.5-flash', ARRAY['gemini-2.5-flash','gpt-4o-mini'], 1500),
  ('long_form', 'openai', 'gpt-4o-mini', ARRAY['gpt-4o-mini','gemini-2.5-flash','claude-3-5-sonnet-20241022'], 2000),
  ('code', 'openai', 'gpt-4o-mini', ARRAY['gpt-4o-mini','claude-3-5-sonnet-20241022'], 2000),
  ('reasoning', 'anthropic', 'claude-3-5-sonnet-20241022', ARRAY['claude-3-5-sonnet-20241022','gpt-4o','gemini-2.5-flash'], 3000)
ON CONFLICT (task_type) DO NOTHING;

-- ── Lab / hub test runs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'normal'
    CHECK (mode IN ('quick', 'normal', 'deep', 'benchmark', 'routed')),
  prompt_hash TEXT NOT NULL,
  prompt_preview TEXT,
  system_prompt_preview TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'blocked')),
  estimated_cost_micro_usd BIGINT NOT NULL DEFAULT 0,
  actual_cost_micro_usd BIGINT NOT NULL DEFAULT 0,
  free_tier_used BOOLEAN NOT NULL DEFAULT false,
  routing_reason TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_test_runs_user_created
  ON public.ai_test_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_test_runs_status
  ON public.ai_test_runs (status, created_at DESC);

ALTER TABLE public.ai_test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_test_runs_admin_all"
  ON public.ai_test_runs FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.ai_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.ai_test_runs(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'gemini', 'anthropic', 'mock')),
  model TEXT NOT NULL,
  response_text TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  estimated_cost_micro_usd BIGINT NOT NULL DEFAULT 0,
  actual_cost_micro_usd BIGINT NOT NULL DEFAULT 0,
  finish_reason TEXT,
  cached BOOLEAN NOT NULL DEFAULT false,
  free_tier_used BOOLEAN NOT NULL DEFAULT false,
  routing_reason TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_test_results_test
  ON public.ai_test_results (test_id);
CREATE INDEX IF NOT EXISTS idx_ai_test_results_provider_model
  ON public.ai_test_results (provider, model, created_at DESC);

ALTER TABLE public.ai_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_test_results_admin_all"
  ON public.ai_test_results FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── Response cache ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_test_cache (
  cache_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  response_payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_test_cache_expires
  ON public.ai_test_cache (expires_at);

ALTER TABLE public.ai_test_cache ENABLE ROW LEVEL SECURITY;

-- No authenticated policies — service role only

-- Admin SELECT on ai_usage_logs for hub overview
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_usage_logs' AND policyname = 'ai_usage_logs_admin_select'
  ) THEN
    CREATE POLICY "ai_usage_logs_admin_select"
      ON public.ai_usage_logs FOR SELECT TO authenticated
      USING (public.is_admin());
  END IF;
END $$;

COMMENT ON TABLE public.ai_hub_settings IS
  'AI Hub platform settings. USD ops budgets only for Hub Lab; free-tier tokens do not debit credits ledger.';
