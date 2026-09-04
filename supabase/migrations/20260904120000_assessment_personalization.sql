-- Assessment personalization: context snapshots, blueprints, selection ledger, skill evidence.
-- Additive; keeps assemble_assessment_from_template for legacy template-only starts.

CREATE TABLE IF NOT EXISTS public.assessment_context_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_version_id uuid NULL,
  jd_version_id uuid NULL,
  role_slug text NOT NULL,
  domain text NULL,
  experience_level text NULL,
  skill_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  performance_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  setup_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  personalized boolean NOT NULL DEFAULT true,
  force_general boolean NOT NULL DEFAULT false,
  selection_seed text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessment_context_snapshots_user_idx
  ON public.assessment_context_snapshots (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.assessment_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_snapshot_id uuid NOT NULL REFERENCES public.assessment_context_snapshots(id) ON DELETE CASCADE,
  role_slug text NOT NULL,
  category_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  difficulty_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  question_count integer NOT NULL,
  duration_minutes integer NULL,
  boosted_categories text[] NOT NULL DEFAULT '{}'::text[],
  blueprint_policy_version text NOT NULL DEFAULT 'assessment-blueprint-v1',
  selection_policy_version text NOT NULL DEFAULT 'assessment-selection-v1',
  selection_seed text NOT NULL,
  why_selected text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessment_blueprints_user_idx
  ON public.assessment_blueprints (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.assessment_question_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  sequence integer NOT NULL,
  skill_or_category text NULL,
  difficulty text NULL,
  selection_reason jsonb NOT NULL DEFAULT '[]'::jsonb,
  selection_score numeric NULL,
  selection_policy_version text NOT NULL DEFAULT 'assessment-selection-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id),
  UNIQUE (attempt_id, sequence)
);

CREATE INDEX IF NOT EXISTS assessment_question_selections_user_idx
  ON public.assessment_question_selections (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_skill_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id text NOT NULL,
  source_type text NOT NULL,
  source_id text NULL,
  confidence numeric NOT NULL DEFAULT 0.5,
  performance numeric NULL,
  evidence_timestamp timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_skill_evidence_user_skill_idx
  ON public.user_skill_evidence (user_id, skill_id);

ALTER TABLE public.assessment_context_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_question_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skill_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assessment_context_snapshots_own_select ON public.assessment_context_snapshots;
CREATE POLICY assessment_context_snapshots_own_select
  ON public.assessment_context_snapshots FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS assessment_blueprints_own_select ON public.assessment_blueprints;
CREATE POLICY assessment_blueprints_own_select
  ON public.assessment_blueprints FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS assessment_question_selections_own_select ON public.assessment_question_selections;
CREATE POLICY assessment_question_selections_own_select
  ON public.assessment_question_selections FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_skill_evidence_own_all ON public.user_skill_evidence;
DROP POLICY IF EXISTS user_skill_evidence_own_select ON public.user_skill_evidence;
DROP POLICY IF EXISTS user_skill_evidence_own_insert ON public.user_skill_evidence;
CREATE POLICY user_skill_evidence_own_select
  ON public.user_skill_evidence FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY user_skill_evidence_own_insert
  ON public.user_skill_evidence FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.assessment_context_snapshots FROM PUBLIC, anon;
REVOKE ALL ON public.assessment_blueprints FROM PUBLIC, anon;
REVOKE ALL ON public.assessment_question_selections FROM PUBLIC, anon;
GRANT SELECT ON public.assessment_context_snapshots TO authenticated;
GRANT SELECT ON public.assessment_blueprints TO authenticated;
GRANT SELECT ON public.assessment_question_selections TO authenticated;
GRANT SELECT, INSERT ON public.user_skill_evidence TO authenticated;
GRANT ALL ON public.assessment_context_snapshots TO service_role;
GRANT ALL ON public.assessment_blueprints TO service_role;
GRANT ALL ON public.assessment_question_selections TO service_role;
GRANT ALL ON public.user_skill_evidence TO service_role;

-- Persist personalization metadata onto an existing attempt (called from Edge after assemble).
CREATE OR REPLACE FUNCTION public.attach_assessment_personalization(
  p_test_id uuid,
  p_setup jsonb DEFAULT '{}'::jsonb,
  p_category_weights jsonb DEFAULT '{}'::jsonb,
  p_selection_seed text DEFAULT NULL,
  p_why_selected text DEFAULT NULL,
  p_ledger jsonb DEFAULT '[]'::jsonb,
  p_personalized boolean DEFAULT true,
  p_force_general boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_test public.mock_tests%ROWTYPE;
  v_snap_id uuid;
  v_blueprint_id uuid;
  v_role text;
  v_seed text;
  v_cfg jsonb;
  v_item jsonb;
  v_seq integer := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501', DETAIL = 'UNAUTHORIZED';
  END IF;

  SELECT * INTO v_test FROM public.mock_tests WHERE id = p_test_id AND user_id = uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt not found' USING ERRCODE = 'P0001', DETAIL = 'ASSESSMENT_NOT_FOUND';
  END IF;

  v_role := COALESCE(NULLIF(trim(p_setup->>'role_slug'), ''), NULLIF(trim(v_test.config->>'template_slug'), ''), 'general-aptitude');
  v_seed := COALESCE(NULLIF(trim(p_selection_seed), ''), md5(uid::text || p_test_id::text || v_role));

  INSERT INTO public.assessment_context_snapshots (
    user_id, role_slug, domain, experience_level, skill_snapshot, performance_snapshot,
    setup_payload, policy_versions, personalized, force_general, selection_seed,
    resume_version_id, jd_version_id
  ) VALUES (
    uid,
    v_role,
    NULLIF(trim(p_setup->>'domain'), ''),
    NULLIF(trim(p_setup->>'experience_level'), ''),
    jsonb_build_object(
      'include', COALESCE(p_setup->'skills_include', '[]'::jsonb),
      'exclude', COALESCE(p_setup->'skills_exclude', '[]'::jsonb)
    ),
    jsonb_build_object('weak_topics', COALESCE(p_setup->'weak_topics', '[]'::jsonb)),
    COALESCE(p_setup, '{}'::jsonb),
    jsonb_build_object(
      'blueprint', 'assessment-blueprint-v1',
      'selection', 'assessment-selection-v1'
    ),
    p_personalized,
    p_force_general,
    v_seed,
    NULLIF(trim(p_setup->>'resume_version_id'), '')::uuid,
    NULLIF(trim(p_setup->>'jd_version_id'), '')::uuid
  )
  RETURNING id INTO v_snap_id;

  INSERT INTO public.assessment_blueprints (
    user_id, context_snapshot_id, role_slug, category_weights, question_count,
    duration_minutes, blueprint_policy_version, selection_policy_version,
    selection_seed, why_selected
  ) VALUES (
    uid,
    v_snap_id,
    v_role,
    COALESCE(p_category_weights, '{}'::jsonb),
    COALESCE(cardinality(v_test.question_ids), 0),
    v_test.duration_minutes,
    'assessment-blueprint-v1',
    'assessment-selection-v1',
    v_seed,
    p_why_selected
  )
  RETURNING id INTO v_blueprint_id;

  IF jsonb_typeof(p_ledger) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_ledger)
    LOOP
      v_seq := v_seq + 1;
      INSERT INTO public.assessment_question_selections (
        attempt_id, user_id, question_id, sequence, skill_or_category, difficulty,
        selection_reason, selection_score, selection_policy_version
      ) VALUES (
        p_test_id,
        uid,
        (v_item->>'questionId')::uuid,
        COALESCE((v_item->>'sequence')::integer, v_seq),
        NULLIF(v_item->>'category', ''),
        NULLIF(v_item->>'difficulty', ''),
        COALESCE(v_item->'selectedBecause', '[]'::jsonb),
        NULLIF(v_item#>>'{score,total}', '')::numeric,
        COALESCE(v_item->>'selectionPolicyVersion', 'assessment-selection-v1')
      )
      ON CONFLICT (attempt_id, question_id) DO NOTHING;
    END LOOP;
  END IF;

  v_cfg := COALESCE(v_test.config, '{}'::jsonb)
    || jsonb_build_object(
      'context_snapshot_id', v_snap_id,
      'blueprint_id', v_blueprint_id,
      'selection_seed', v_seed,
      'personalized', p_personalized,
      'force_general', p_force_general,
      'role_slug', v_role,
      'why_selected', p_why_selected,
      'assessment_objective', p_setup->>'assessment_objective',
      'experience_level', p_setup->>'experience_level',
      'category_weights', COALESCE(p_category_weights, '{}'::jsonb)
    );

  UPDATE public.mock_tests
  SET config = v_cfg, updated_at = now()
  WHERE id = p_test_id AND user_id = uid;

  RETURN jsonb_build_object(
    'test_id', p_test_id,
    'context_snapshot_id', v_snap_id,
    'blueprint_id', v_blueprint_id,
    'selection_seed', v_seed,
    'personalized', p_personalized,
    'why_selected', p_why_selected
  );
END;
$$;

REVOKE ALL ON FUNCTION public.attach_assessment_personalization(uuid, jsonb, jsonb, text, text, jsonb, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_assessment_personalization(uuid, jsonb, jsonb, text, text, jsonb, boolean, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.attach_assessment_personalization IS
  'Attaches immutable personalization snapshot + blueprint + selection ledger to a mock_tests assessment attempt.';
