-- Session AI enforcement schema additions.
-- Ensures the sessions table has the columns needed for AI type gating.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'mock';

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS session_type text;

COMMENT ON COLUMN public.sessions.type IS
  'Session mode. AI generation allowed for mock, warmup, rehearsal, room, practice; live requires practice tag in DB.';

COMMENT ON COLUMN public.sessions.tags IS
  'Optional labels. Include "practice" to permit AI assistance on type=live rehearsal sessions.';

COMMENT ON COLUMN public.sessions.session_type IS
  'Legacy session type column kept for backward compatibility with older clients.';

-- Index for efficient session enforcement lookups
CREATE INDEX IF NOT EXISTS idx_sessions_type_user
  ON public.sessions (user_id, type);
