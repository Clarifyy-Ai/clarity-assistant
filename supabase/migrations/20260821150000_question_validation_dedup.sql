-- Deterministic question validation, similarity deduplication, and current-affairs temporal metadata.

BEGIN;

-- ── 1. Current-affairs metadata columns on questions ──────────────────────────
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS is_current_affairs boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ca_applicable_date date,
  ADD COLUMN IF NOT EXISTS ca_source_date date,
  ADD COLUMN IF NOT EXISTS ca_cutoff_date date,
  ADD COLUMN IF NOT EXISTS ca_primary_source text,
  ADD COLUMN IF NOT EXISTS ca_expiry_date date,
  ADD COLUMN IF NOT EXISTS ca_is_stale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ca_stale_flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'unvalidated'
    CHECK (validation_status IN ('unvalidated', 'valid', 'invalid', 'flagged_for_review')),
  ADD COLUMN IF NOT EXISTS validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_questions_ca_stale
  ON public.questions (is_current_affairs, ca_is_stale)
  WHERE is_current_affairs = true;

CREATE INDEX IF NOT EXISTS idx_questions_validation_status
  ON public.questions (validation_status);

-- Helper function to automatically flag stale current-affairs content
CREATE OR REPLACE FUNCTION public.flag_stale_current_affairs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count integer;
BEGIN
  UPDATE public.questions
     SET ca_is_stale = true,
         ca_stale_flagged_at = now()
   WHERE is_current_affairs = true
     AND ca_is_stale = false
     AND (
       (ca_expiry_date IS NOT NULL AND ca_expiry_date < CURRENT_DATE)
       OR (ca_cutoff_date IS NOT NULL AND ca_cutoff_date < (CURRENT_DATE - INTERVAL '1 year'))
     );

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$;

-- ── 2. Question similarity & deduplication match persistence ──────────────────
CREATE TABLE IF NOT EXISTS public.question_similarity_matches (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id           uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  matching_question_id  uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  similarity_score      numeric NOT NULL CHECK (similarity_score >= 0 AND similarity_score <= 1),
  token_jaccard         numeric,
  ngram_jaccard         numeric,
  fingerprint_match     boolean NOT NULL DEFAULT false,
  decision              text NOT NULL
                        CHECK (decision IN (
                          'exact_duplicate','near_duplicate','template_clone','unique','flagged_for_review','rejected','approved'
                        )),
  reviewer_override     text
                        CHECK (reviewer_override IN ('approved','rejected','merged','distinct')),
  reviewer_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_notes        text,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, matching_question_id),
  CHECK (question_id <> matching_question_id)
);

CREATE INDEX IF NOT EXISTS idx_q_sim_matches_q_id
  ON public.question_similarity_matches (question_id);

CREATE INDEX IF NOT EXISTS idx_q_sim_matches_matching_q_id
  ON public.question_similarity_matches (matching_question_id);

CREATE INDEX IF NOT EXISTS idx_q_sim_matches_decision
  ON public.question_similarity_matches (decision);

CREATE INDEX IF NOT EXISTS idx_q_sim_matches_score
  ON public.question_similarity_matches (similarity_score DESC);

-- ── 3. RLS Policies ─────────────────────────────────────────────────────────
ALTER TABLE public.question_similarity_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS q_sim_matches_select ON public.question_similarity_matches;
CREATE POLICY q_sim_matches_select ON public.question_similarity_matches
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.questions q
      WHERE q.id = question_id AND q.is_public = true
    )
  );

DROP POLICY IF EXISTS q_sim_matches_admin ON public.question_similarity_matches;
CREATE POLICY q_sim_matches_admin ON public.question_similarity_matches
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;
