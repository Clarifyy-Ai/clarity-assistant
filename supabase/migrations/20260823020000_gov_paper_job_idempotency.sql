-- One Generate click / idempotency key must map to at most one paper job
-- per user. Existing rows have no duplicate (user_id, idempotency_key) pairs.

CREATE UNIQUE INDEX IF NOT EXISTS gov_paper_generation_jobs_user_idempotency_uidx
  ON public.gov_paper_generation_jobs (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND length(trim(idempotency_key)) > 0;
