-- Durable account deletion operations (idempotent, step-level status).
-- Additive only; does not rewrite prior migrations.

CREATE TABLE IF NOT EXISTS public.account_deletion_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN (
      'requested',
      'identity_confirmed',
      'processing',
      'partially_completed',
      'retrying',
      'completed',
      'failed'
    )),
  current_step text,
  error_code text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_operations_one_open_per_user
  ON public.account_deletion_operations (user_id)
  WHERE status NOT IN ('completed', 'failed');

CREATE INDEX IF NOT EXISTS account_deletion_operations_user_idx
  ON public.account_deletion_operations (user_id, created_at DESC);

ALTER TABLE public.account_deletion_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_deletion_operations_select_own ON public.account_deletion_operations;
CREATE POLICY account_deletion_operations_select_own
  ON public.account_deletion_operations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Writes are Edge / service-role only.
REVOKE INSERT, UPDATE, DELETE ON public.account_deletion_operations FROM authenticated, anon;
GRANT SELECT ON public.account_deletion_operations TO authenticated;

CREATE TABLE IF NOT EXISTS public.gap_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  resume_id uuid NOT NULL,
  jd_id uuid NOT NULL,
  resume_updated_at timestamptz,
  jd_updated_at timestamptz,
  result jsonb NOT NULL,
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gap_analyses_user_sources_idx
  ON public.gap_analyses (user_id, resume_id, jd_id);

ALTER TABLE public.gap_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gap_analyses_own ON public.gap_analyses;
CREATE POLICY gap_analyses_own
  ON public.gap_analyses
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS region text;

COMMENT ON COLUMN public.profiles.region IS
  'Optional ISO-like region code (e.g. IN). Used for Government Exam availability; never inferred from client-only locale.';
