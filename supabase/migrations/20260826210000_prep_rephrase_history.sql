-- Durable Prep Lab rephraser history (TC-PREP-003 / P0-03).
-- Owner-scoped; idempotent on (user_id, input_hash) for successful rows.

CREATE TABLE IF NOT EXISTS public.prep_rephrase_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  input_hash      TEXT NOT NULL,
  original_text   TEXT NOT NULL,
  alternatives    JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider        TEXT,
  model           TEXT,
  credit_op_id    TEXT,
  status          TEXT NOT NULL DEFAULT 'completed'
                  CHECK (status IN ('completed', 'failed', 'offline_fallback')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS prep_rephrase_history_user_input_hash_uidx
  ON public.prep_rephrase_history (user_id, input_hash);

CREATE INDEX IF NOT EXISTS prep_rephrase_history_user_created_idx
  ON public.prep_rephrase_history (user_id, created_at DESC);

ALTER TABLE public.prep_rephrase_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own rephrase history" ON public.prep_rephrase_history;
CREATE POLICY "Users can read own rephrase history"
  ON public.prep_rephrase_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own rephrase history" ON public.prep_rephrase_history;
CREATE POLICY "Users can insert own rephrase history"
  ON public.prep_rephrase_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own rephrase history" ON public.prep_rephrase_history;
CREATE POLICY "Users can update own rephrase history"
  ON public.prep_rephrase_history FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own rephrase history" ON public.prep_rephrase_history;
CREATE POLICY "Users can delete own rephrase history"
  ON public.prep_rephrase_history FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prep_rephrase_history TO authenticated;
GRANT ALL ON public.prep_rephrase_history TO service_role;
