-- Admin Auto-Approval workflow: configurable rules, immutable audit events,
-- and separation of APPROVED vs PUBLISHED state.
-- Python validates/dedupes/scores; Edge orchestrates policy + persistence.

BEGIN;

-- ── Configurable auto-approval rules (versioned, auditable) ─────────────────
CREATE TABLE IF NOT EXISTS public.gov_auto_approval_rules (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type           text NOT NULL CHECK (entity_type IN ('question', 'paper')),
  rule_version          int NOT NULL DEFAULT 1,
  enabled               boolean NOT NULL DEFAULT false,
  min_quality_score     numeric NOT NULL DEFAULT 40,
  duplicate_threshold   numeric NOT NULL DEFAULT 0.92,
  auto_publish          boolean NOT NULL DEFAULT false,
  allowed_source_types  text[] NOT NULL DEFAULT ARRAY[
    'official_verified', 'verified_public_source', 'approved_bank',
    'internal_question_bank', 'generated_practice', 'ai_generated_practice'
  ]::text[],
  allowed_exam_ids      uuid[],
  allowed_languages     text[],
  allow_verified_public boolean NOT NULL DEFAULT false,
  allow_internal_bank   boolean NOT NULL DEFAULT true,
  allow_generated_practice boolean NOT NULL DEFAULT true,
  allow_ai_generated_practice boolean NOT NULL DEFAULT true,
  require_provenance    boolean NOT NULL DEFAULT true,
  manual_review_flags   text[] NOT NULL DEFAULT ARRAY[
    'OCR_UNCERTAIN', 'ANSWER_KEY_CONFLICT', 'POLICY_FLAG',
    'SOURCE_CONFLICT', 'NEAR_DUPLICATE', 'EXACT_DUPLICATE',
    'MISSING_PROVENANCE', 'LOW_QUALITY', 'MALFORMED', 'AI_AS_OFFICIAL'
  ]::text[],
  notes                 text,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, rule_version)
);

CREATE INDEX IF NOT EXISTS idx_gov_auto_approval_rules_active
  ON public.gov_auto_approval_rules (entity_type, enabled, rule_version DESC);

-- Seed default rules (disabled — admin must explicitly enable)
INSERT INTO public.gov_auto_approval_rules (
  entity_type, rule_version, enabled, notes
) VALUES
  ('question', 1, false, 'Default question auto-approval policy v1 (disabled until admin enables)'),
  ('paper', 1, false, 'Default paper auto-approval policy v1 (disabled until admin enables)')
ON CONFLICT (entity_type, rule_version) DO NOTHING;

-- ── Immutable auto-approval audit events ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gov_auto_approval_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type         text NOT NULL CHECK (entity_type IN ('question', 'paper')),
  entity_id           uuid NOT NULL,
  outcome             text NOT NULL CHECK (outcome IN (
    'AUTO_APPROVED', 'MANUAL_REVIEW', 'REJECTED', 'AUTO_APPROVAL_FAILED'
  )),
  approval_mode       text CHECK (approval_mode IN ('AUTO', 'MANUAL')),
  rule_version        int,
  rule_evaluation     jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_type         text,
  quality_score       numeric,
  duplicate_result    text,
  provenance          jsonb,
  processing_job_id   uuid,
  paper_id            uuid,
  previous_status     text,
  new_status          text,
  publish_status      text,
  idempotency_key     text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_auto_approval_events_idempotent
  ON public.gov_auto_approval_events (entity_type, entity_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gov_auto_approval_events_entity
  ON public.gov_auto_approval_events (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gov_auto_approval_events_job
  ON public.gov_auto_approval_events (processing_job_id)
  WHERE processing_job_id IS NOT NULL;

-- ── Approval mode columns (separate APPROVED from PUBLISHED) ─────────────────
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS approval_mode text
    CHECK (approval_mode IS NULL OR approval_mode IN ('AUTO', 'MANUAL'));

ALTER TABLE public.gov_generated_papers
  ADD COLUMN IF NOT EXISTS approval_mode text
    CHECK (approval_mode IS NULL OR approval_mode IN ('AUTO', 'MANUAL')),
  ADD COLUMN IF NOT EXISTS publish_status text NOT NULL DEFAULT 'draft'
    CHECK (publish_status IN ('draft', 'published', 'archived'));

CREATE INDEX IF NOT EXISTS idx_gov_generated_papers_publish
  ON public.gov_generated_papers (publish_status, review_state);

COMMENT ON TABLE public.gov_auto_approval_rules IS
  'Configurable, versioned auto-approval policy. Changes are audited via admin_audit_log.';
COMMENT ON TABLE public.gov_auto_approval_events IS
  'Immutable audit trail for every auto-approval evaluation. Answers "why was this auto-approved?"';
COMMENT ON COLUMN public.questions.approval_mode IS
  'AUTO = rule engine approved; MANUAL = admin override; NULL = not yet approved.';
COMMENT ON COLUMN public.gov_generated_papers.publish_status IS
  'Publication gate separate from review_state=approved. Never auto-publish unless policy allows.';

-- ── RLS: admin-only for rules; service role + admin for events ───────────────
ALTER TABLE public.gov_auto_approval_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_auto_approval_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gov_auto_approval_rules_admin ON public.gov_auto_approval_rules;
CREATE POLICY gov_auto_approval_rules_admin ON public.gov_auto_approval_rules
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS gov_auto_approval_events_admin_read ON public.gov_auto_approval_events;
CREATE POLICY gov_auto_approval_events_admin_read ON public.gov_auto_approval_events
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS gov_auto_approval_events_service_insert ON public.gov_auto_approval_events;
CREATE POLICY gov_auto_approval_events_service_insert ON public.gov_auto_approval_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR auth.role() = 'service_role');

-- ── Idempotent auto-approval application RPC ───────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_auto_approval_event(
  p_entity_type text,
  p_entity_id uuid,
  p_outcome text,
  p_approval_mode text DEFAULT NULL,
  p_rule_version int DEFAULT NULL,
  p_rule_evaluation jsonb DEFAULT '{}'::jsonb,
  p_source_type text DEFAULT NULL,
  p_quality_score numeric DEFAULT NULL,
  p_duplicate_result text DEFAULT NULL,
  p_provenance jsonb DEFAULT NULL,
  p_processing_job_id uuid DEFAULT NULL,
  p_paper_id uuid DEFAULT NULL,
  p_previous_status text DEFAULT NULL,
  p_new_status text DEFAULT NULL,
  p_publish_status text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_auto_publish boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_event_id uuid;
  v_result jsonb;
BEGIN
  -- Idempotency: return existing event if same key already processed
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing
    FROM public.gov_auto_approval_events
    WHERE entity_type = p_entity_type
      AND entity_id = p_entity_id
      AND idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object(
        'event_id', v_existing,
        'idempotent', true,
        'outcome', p_outcome
      );
    END IF;
  END IF;

  -- Insert immutable audit event
  INSERT INTO public.gov_auto_approval_events (
    entity_type, entity_id, outcome, approval_mode, rule_version,
    rule_evaluation, source_type, quality_score, duplicate_result,
    provenance, processing_job_id, paper_id, previous_status,
    new_status, publish_status, idempotency_key
  ) VALUES (
    p_entity_type, p_entity_id, p_outcome, p_approval_mode, p_rule_version,
    p_rule_evaluation, p_source_type, p_quality_score, p_duplicate_result,
    p_provenance, p_processing_job_id, p_paper_id, p_previous_status,
    p_new_status, p_publish_status, p_idempotency_key
  )
  RETURNING id INTO v_event_id;

  -- Apply state changes only on AUTO_APPROVED (never on failure — fail closed)
  IF p_outcome = 'AUTO_APPROVED' AND p_entity_type = 'question' THEN
    UPDATE public.questions SET
      review_status = 'approved',
      approval_mode = COALESCE(p_approval_mode, 'AUTO'),
      is_verified = true,
      is_public = CASE WHEN p_auto_publish THEN true ELSE is_public END,
      publish_status = CASE
        WHEN p_auto_publish THEN 'published'
        ELSE COALESCE(publish_status, 'draft')
      END,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'auto_approval_event_id', v_event_id,
        'auto_approval_rule_version', p_rule_version
      ),
      updated_at = now()
    WHERE id = p_entity_id
      AND (review_status IS DISTINCT FROM 'approved' OR approval_mode IS NULL);

  ELSIF p_outcome = 'AUTO_APPROVED' AND p_entity_type = 'paper' THEN
    UPDATE public.gov_generated_papers SET
      review_state = 'approved',
      approval_mode = COALESCE(p_approval_mode, 'AUTO'),
      publish_status = CASE
        WHEN p_auto_publish THEN 'published'
        ELSE COALESCE(publish_status, 'draft')
      END,
      updated_at = now()
    WHERE id = p_entity_id
      AND review_state NOT IN ('approved', 'rejected', 'retired');

  ELSIF p_outcome IN ('MANUAL_REVIEW', 'AUTO_APPROVAL_FAILED') AND p_entity_type = 'question' THEN
    UPDATE public.questions SET
      review_status = CASE
        WHEN review_status = 'approved' THEN review_status
        ELSE 'review_required'
      END,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'auto_approval_outcome', p_outcome,
        'auto_approval_event_id', v_event_id
      ),
      updated_at = now()
    WHERE id = p_entity_id
      AND review_status NOT IN ('approved', 'rejected', 'archived');

  ELSIF p_outcome IN ('MANUAL_REVIEW', 'AUTO_APPROVAL_FAILED', 'REJECTED') AND p_entity_type = 'paper' THEN
    UPDATE public.gov_generated_papers SET
      review_state = CASE
        WHEN p_outcome = 'REJECTED' THEN 'rejected'
        WHEN review_state = 'approved' THEN review_state
        ELSE 'needs_review'
      END,
      updated_at = now()
    WHERE id = p_entity_id
      AND review_state NOT IN ('approved', 'retired');

  ELSIF p_outcome = 'REJECTED' AND p_entity_type = 'question' THEN
    UPDATE public.questions SET
      review_status = 'rejected',
      is_verified = false,
      is_public = false,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'auto_approval_outcome', 'REJECTED',
        'auto_approval_event_id', v_event_id
      ),
      updated_at = now()
    WHERE id = p_entity_id
      AND review_status NOT IN ('approved');
  END IF;

  v_result := jsonb_build_object(
    'event_id', v_event_id,
    'idempotent', false,
    'outcome', p_outcome,
    'entity_type', p_entity_type,
    'entity_id', p_entity_id
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_auto_approval_event FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_auto_approval_event TO service_role;

COMMIT;
