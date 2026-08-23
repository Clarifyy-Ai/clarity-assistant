-- Hybrid backend operation provenance log (Edge → database|python|ai|fallback).
-- Service-role inserts only; users cannot read other users' rows.

BEGIN;

CREATE TABLE IF NOT EXISTS public.backend_operation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id text NOT NULL,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  operation_type text NOT NULL,
  source text NOT NULL,
  provider text NULL,
  model_version text NULL,
  python_service_version text NULL,
  fallback_reason text NULL,
  execution_ms integer NULL CHECK (execution_ms IS NULL OR execution_ms >= 0),
  status text NOT NULL DEFAULT 'success',
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT backend_operation_log_source_check
    CHECK (source IN ('database', 'python', 'ai', 'fallback', 'deterministic')),
  CONSTRAINT backend_operation_log_status_check
    CHECK (status IN ('success', 'failure', 'partial'))
);

CREATE INDEX IF NOT EXISTS idx_backend_operation_log_created_at
  ON public.backend_operation_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backend_operation_log_user_created
  ON public.backend_operation_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backend_operation_log_correlation
  ON public.backend_operation_log (correlation_id);

CREATE INDEX IF NOT EXISTS idx_backend_operation_log_operation_id
  ON public.backend_operation_log (operation_id);

ALTER TABLE public.backend_operation_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.backend_operation_log FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.backend_operation_log TO service_role;

-- Authenticated users may read only their own operation rows (debug / support UI).
DROP POLICY IF EXISTS backend_operation_log_select_own ON public.backend_operation_log;
CREATE POLICY backend_operation_log_select_own
  ON public.backend_operation_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON TABLE public.backend_operation_log TO authenticated;

COMMENT ON TABLE public.backend_operation_log IS
  'Hybrid execution provenance: which source (database/python/ai/fallback) produced each operation.';

COMMIT;
