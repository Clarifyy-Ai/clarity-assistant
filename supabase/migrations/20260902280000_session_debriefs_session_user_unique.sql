-- One debrief per session per user; dedupe before unique index (mirrors scorecards).

DELETE FROM public.session_debriefs a
USING public.session_debriefs b
WHERE a.session_id IS NOT NULL
  AND a.session_id = b.session_id
  AND a.user_id = b.user_id
  AND (
    a.created_at < b.created_at
    OR (a.created_at = b.created_at AND a.id < b.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_debriefs_session_user
  ON public.session_debriefs (session_id, user_id)
  WHERE session_id IS NOT NULL;

COMMENT ON INDEX public.idx_session_debriefs_session_user IS
  'Enforces one persisted debrief per session per user for generate-debrief idempotency.';
