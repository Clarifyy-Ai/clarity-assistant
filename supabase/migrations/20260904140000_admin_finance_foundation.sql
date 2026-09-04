-- Admin finance foundation: unit cost catalog, provider usage, fee settings.
-- Never stores API secrets. Costs are ACTUAL or ESTIMATED — unknown ≠ zero.

-- ── billing_settings finance columns ─────────────────────────────────────────
ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS payment_fee_rate_bps INTEGER
    CHECK (payment_fee_rate_bps IS NULL OR payment_fee_rate_bps BETWEEN 0 AND 10000),
  ADD COLUMN IF NOT EXISTS payment_fee_cost_type TEXT
    CHECK (payment_fee_cost_type IS NULL OR payment_fee_cost_type IN ('estimated', 'actual')),
  ADD COLUMN IF NOT EXISTS finance_currency TEXT NOT NULL DEFAULT 'INR';

COMMENT ON COLUMN public.billing_settings.payment_fee_rate_bps IS
  'Payment processor fee in basis points (100 = 1%). NULL = fee COST UNKNOWN (do not treat as 0).';
COMMENT ON COLUMN public.billing_settings.payment_fee_cost_type IS
  'estimated | actual — never mix unlabeled.';

-- ── provider_unit_costs (server-owned catalog) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_unit_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  service TEXT NOT NULL,
  operation TEXT NOT NULL,
  unit TEXT NOT NULL,
  unit_cost NUMERIC(18, 8) NOT NULL CHECK (unit_cost >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  cost_type TEXT NOT NULL CHECK (cost_type IN ('estimated', 'actual')),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'seed',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT provider_unit_costs_window CHECK (
    effective_to IS NULL OR effective_to > effective_from
  )
);

CREATE INDEX IF NOT EXISTS idx_provider_unit_costs_lookup
  ON public.provider_unit_costs (provider, service, operation, effective_from DESC);

ALTER TABLE public.provider_unit_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_unit_costs_admin_select ON public.provider_unit_costs;
CREATE POLICY provider_unit_costs_admin_select ON public.provider_unit_costs
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS provider_unit_costs_admin_write ON public.provider_unit_costs;
CREATE POLICY provider_unit_costs_admin_write ON public.provider_unit_costs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Seed ESTIMATED rate-card rows (USD per 1M tokens or per minute). Values mirror Edge rate cards.
INSERT INTO public.provider_unit_costs
  (provider, service, operation, unit, unit_cost, currency, cost_type, source, notes)
SELECT * FROM (VALUES
  ('gemini', 'ai', 'text_generation_input', '1M_tokens', 0.10::numeric, 'USD', 'estimated', 'aiProvider.ts', 'gemini-2.0-flash input approx'),
  ('gemini', 'ai', 'text_generation_output', '1M_tokens', 0.40::numeric, 'USD', 'estimated', 'aiProvider.ts', 'gemini-2.0-flash output approx'),
  ('openai', 'ai', 'text_generation_input', '1M_tokens', 0.15::numeric, 'USD', 'estimated', 'aiProvider.ts', 'gpt-4o-mini input approx'),
  ('openai', 'ai', 'text_generation_output', '1M_tokens', 0.60::numeric, 'USD', 'estimated', 'aiProvider.ts', 'gpt-4o-mini output approx'),
  ('anthropic', 'ai', 'text_generation_input', '1M_tokens', 0.80::numeric, 'USD', 'estimated', 'aiProvider.ts', 'claude haiku input approx'),
  ('anthropic', 'ai', 'text_generation_output', '1M_tokens', 4.00::numeric, 'USD', 'estimated', 'aiProvider.ts', 'claude haiku output approx'),
  ('deepgram', 'stt', 'transcription', '1_minute', 0.0043::numeric, 'USD', 'estimated', 'deepgramCost.ts', 'nova-2 approx USD/min')
) AS v(provider, service, operation, unit, unit_cost, currency, cost_type, source, notes)
WHERE NOT EXISTS (SELECT 1 FROM public.provider_unit_costs LIMIT 1);

-- Prefer unique natural key for future upserts
CREATE UNIQUE INDEX IF NOT EXISTS provider_unit_costs_natural_active
  ON public.provider_unit_costs (provider, service, operation, unit, effective_from)
  WHERE effective_to IS NULL;

-- ── provider_usage ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  service TEXT NOT NULL,
  operation TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  feature TEXT,
  source_id TEXT,
  request_id TEXT,
  usage_quantity NUMERIC(18, 6),
  usage_unit TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  duration_ms INTEGER,
  estimated_cost_microcents BIGINT,
  actual_cost_microcents BIGINT,
  currency TEXT NOT NULL DEFAULT 'USD',
  cost_type TEXT NOT NULL CHECK (cost_type IN ('estimated', 'actual', 'unknown')),
  status TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'failed', 'cancelled', 'timeout', 'cached', 'waived', 'refunded')),
  billing_mode TEXT
    CHECK (billing_mode IS NULL OR billing_mode IN (
      'charged', 'included_in_plan', 'free', 'waived', 'internal', 'not_implemented'
    )),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_usage_created
  ON public.provider_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_usage_provider
  ON public.provider_usage (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_usage_feature
  ON public.provider_usage (feature, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_usage_user
  ON public.provider_usage (user_id, created_at DESC);

ALTER TABLE public.provider_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_usage_admin_select ON public.provider_usage;
CREATE POLICY provider_usage_admin_select ON public.provider_usage
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Inserts only via service role (Edge). No authenticated insert policy.

-- Backfill from ai_usage_logs as ESTIMATED (idempotent by request marker in metadata)
INSERT INTO public.provider_usage (
  provider,
  service,
  operation,
  user_id,
  feature,
  source_id,
  usage_quantity,
  usage_unit,
  input_tokens,
  output_tokens,
  duration_ms,
  estimated_cost_microcents,
  actual_cost_microcents,
  currency,
  cost_type,
  status,
  billing_mode,
  metadata,
  created_at
)
SELECT
  CASE
    WHEN lower(a.model) LIKE '%gemini%' THEN 'gemini'
    WHEN lower(a.model) LIKE 'gpt%' OR lower(a.model) LIKE 'o1%' THEN 'openai'
    WHEN lower(a.model) LIKE '%claude%' THEN 'anthropic'
    WHEN lower(a.model) LIKE '%nova%' OR lower(a.model) LIKE '%deepgram%' OR lower(a.model) LIKE '%flux%' THEN 'deepgram'
    ELSE 'unknown'
  END AS provider,
  CASE
    WHEN lower(a.model) LIKE '%nova%' OR lower(a.model) LIKE '%deepgram%' OR lower(a.model) LIKE '%flux%' THEN 'stt'
    ELSE 'ai'
  END AS service,
  COALESCE(NULLIF(trim(a.action), ''), 'unknown') AS operation,
  a.user_id,
  a.action AS feature,
  a.id::text AS source_id,
  NULL::numeric AS usage_quantity,
  'tokens'::text AS usage_unit,
  a.input_tokens,
  a.output_tokens,
  a.latency_ms,
  a.cost_microcents::bigint,
  NULL::bigint AS actual_cost_microcents,
  'USD'::text,
  'estimated'::text,
  'success'::text,
  'charged'::text,
  jsonb_build_object(
    'backfill_from', 'ai_usage_logs',
    'model', a.model,
    'was_fallback', COALESCE(a.was_fallback, false)
  ),
  a.created_at
FROM public.ai_usage_logs a
WHERE NOT EXISTS (
  SELECT 1 FROM public.provider_usage u
  WHERE u.source_id = a.id::text
    AND (u.metadata->>'backfill_from') = 'ai_usage_logs'
)
LIMIT 100000;

-- Admin SELECT on ai_usage_logs for finance joins (if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_usage_logs'
      AND policyname = 'Admins can view all AI usage'
  ) THEN
    CREATE POLICY "Admins can view all AI usage"
      ON public.ai_usage_logs
      FOR SELECT TO authenticated
      USING (public.is_admin());
  END IF;
END $$;

-- Grant service role full access (Edge writers)
GRANT SELECT, INSERT, UPDATE ON public.provider_usage TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_unit_costs TO service_role;
