-- Practice Workspace in-progress draft restore (WS5).
-- Extends practice_workspace_sessions so refresh can resume the exact question/answers.

ALTER TABLE public.practice_workspace_sessions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('active', 'completed', 'expired')),
  ADD COLUMN IF NOT EXISTS current_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS question_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS skipped jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mode text,
  ADD COLUMN IF NOT EXISTS question_source text,
  ADD COLUMN IF NOT EXISTS elapsed_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- One active draft per user (mode-agnostic for this workspace).
CREATE UNIQUE INDEX IF NOT EXISTS practice_workspace_one_active_per_user
  ON public.practice_workspace_sessions (user_id)
  WHERE status = 'active';

COMMENT ON COLUMN public.practice_workspace_sessions.status IS
  'active = in-progress draft; completed = finished; expired = abandoned after TTL';
COMMENT ON COLUMN public.practice_workspace_sessions.version IS
  'Optimistic concurrency for multi-tab draft writes';
