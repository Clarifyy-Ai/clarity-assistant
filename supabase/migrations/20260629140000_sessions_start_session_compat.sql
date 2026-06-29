-- Ensure sessions table matches start-session edge function inserts (production compat).

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'mock',
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS document_id uuid,
  ADD COLUMN IF NOT EXISTS jd_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill type from legacy mode column when present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sessions'
      AND column_name = 'mode'
  ) THEN
    EXECUTE $sql$
      UPDATE public.sessions
      SET type = COALESCE(NULLIF(type, ''), mode, 'mock')
      WHERE type IS NULL OR type = ''
    $sql$;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sessions_type_user
  ON public.sessions (user_id, type);
