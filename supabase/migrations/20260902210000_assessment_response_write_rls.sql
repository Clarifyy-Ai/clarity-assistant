-- BUG-009: allow least-privilege client writes on own in-progress attempts and
-- abandon partial assessment sessions before resume.

BEGIN;

-- Owner INSERT only while the parent attempt is live (matches save_owned_test_answer).
DROP POLICY IF EXISTS test_responses_own_insert ON public.test_responses;
CREATE POLICY test_responses_own_insert ON public.test_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.mock_tests mt
      WHERE mt.id = test_id
        AND mt.user_id = auth.uid()
        AND mt.status = 'IN_PROGRESS'
        AND mt.started_at IS NOT NULL
        AND (mt.expires_at IS NULL OR mt.expires_at > clock_timestamp())
    )
  );

-- Owner UPDATE with the same attempt guard (no cross-user writes).
DROP POLICY IF EXISTS test_responses_own_update ON public.test_responses;
CREATE POLICY test_responses_own_update ON public.test_responses
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.mock_tests mt
      WHERE mt.id = test_id
        AND mt.user_id = auth.uid()
        AND mt.status = 'IN_PROGRESS'
        AND mt.started_at IS NOT NULL
        AND (mt.expires_at IS NULL OR mt.expires_at > clock_timestamp())
    )
  );

-- Resume must not return a partial assessment session created before inventory guards.
CREATE OR REPLACE FUNCTION public.assemble_assessment_from_template(
  p_template_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_tpl public.exam_templates%ROWTYPE;
  v_attempts integer;
  v_ids uuid[] := '{}';
  v_cat text;
  v_diff text;
  v_need integer;
  v_picked uuid[];
  v_cat_count integer;
  v_fill integer;
  v_test_id uuid;
  v_total integer;
  v_available integer;
  v_categories text[];
  v_existing_id uuid;
  v_existing_count integer;
  v_reused boolean := false;
BEGIN
  IF v_user IS NULL THEN
    PERFORM public.raise_assessment_start_error('UNAUTHORIZED', 'Not authenticated');
  END IF;

  SELECT * INTO v_tpl
  FROM public.exam_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    PERFORM public.raise_assessment_start_error(
      'ASSESSMENT_NOT_FOUND',
      'Template not found',
      jsonb_build_object('template_id', p_template_id)
    );
  END IF;

  IF COALESCE(v_tpl.is_published, false) IS NOT TRUE OR COALESCE(v_tpl.is_active, true) IS NOT TRUE THEN
    PERFORM public.raise_assessment_start_error(
      'ASSESSMENT_NOT_AVAILABLE',
      'Assessment is not available',
      jsonb_build_object('template_id', p_template_id, 'template_slug', v_tpl.slug)
    );
  END IF;

  IF v_tpl.question_count IS NULL OR v_tpl.question_count <= 0
     OR v_tpl.category_distribution IS NULL
     OR jsonb_typeof(v_tpl.category_distribution) <> 'object'
     OR COALESCE(v_tpl.strict_taxonomy, true) IS NULL THEN
    PERFORM public.raise_assessment_start_error(
      'INVALID_ASSESSMENT_TEMPLATE',
      'Assessment template is invalid',
      jsonb_build_object('template_id', p_template_id, 'template_slug', v_tpl.slug)
    );
  END IF;

  v_total := v_tpl.question_count;

  SELECT ARRAY(
    SELECT jsonb_object_keys(COALESCE(v_tpl.category_distribution, '{}'::jsonb))
  ) INTO v_categories;

  IF COALESCE(cardinality(v_categories), 0) < 1 THEN
    PERFORM public.raise_assessment_start_error(
      'INVALID_ASSESSMENT_TEMPLATE',
      'Assessment template is invalid',
      jsonb_build_object('template_id', p_template_id, 'template_slug', v_tpl.slug)
    );
  END IF;

  SELECT id INTO v_existing_id
  FROM public.mock_tests
  WHERE user_id = v_user
    AND config->>'template_id' = p_template_id::text
    AND config->>'source' = 'exam_template'
    AND status IN ('DRAFT', 'IN_PROGRESS')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NULL AND COALESCE(btrim(p_idempotency_key), '') <> '' THEN
    SELECT id INTO v_existing_id
    FROM public.mock_tests
    WHERE user_id = v_user
      AND config->>'idempotency_key' = btrim(p_idempotency_key)
      AND config->>'source' = 'exam_template'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    SELECT COALESCE(cardinality(question_ids), 0) INTO v_existing_count
    FROM public.mock_tests
    WHERE id = v_existing_id;

    IF v_existing_count >= v_total THEN
      RETURN jsonb_build_object(
        'test_id', v_existing_id,
        'question_count', v_existing_count,
        'duration_minutes', v_tpl.duration_minutes,
        'reused', true,
        'template_slug', v_tpl.slug
      );
    END IF;

    UPDATE public.mock_tests
       SET status = 'ABANDONED',
           updated_at = clock_timestamp()
     WHERE id = v_existing_id;
    v_existing_id := NULL;
  END IF;

  SELECT count(*) INTO v_attempts
  FROM public.mock_tests
  WHERE user_id = v_user
    AND config->>'template_id' = p_template_id::text
    AND status IN ('COMPLETED', 'IN_PROGRESS');

  IF v_tpl.max_attempts IS NOT NULL AND v_attempts >= v_tpl.max_attempts THEN
    PERFORM public.raise_assessment_start_error(
      'MAX_ATTEMPTS_REACHED',
      'Maximum attempts reached for this assessment',
      jsonb_build_object(
        'template_id', p_template_id,
        'template_slug', v_tpl.slug,
        'template_title', v_tpl.title
      )
    );
  END IF;

  SELECT count(*) INTO v_available
  FROM public.questions q
  WHERE public.question_is_assessment_ready(q)
    AND (q.is_public = true OR q.uploaded_by = v_user OR q.created_by = v_user)
    AND public.question_matches_template_taxonomy(
      q,
      COALESCE(v_tpl.role_slug, v_tpl.slug),
      v_categories,
      COALESCE(v_tpl.strict_taxonomy, true)
    );

  IF v_available < v_total THEN
    PERFORM public.raise_assessment_start_error(
      'INSUFFICIENT_QUESTION_INVENTORY',
      'Not enough eligible questions to assemble this assessment',
      jsonb_build_object(
        'requested_count', v_total,
        'available_count', v_available,
        'template_id', p_template_id,
        'template_slug', v_tpl.slug,
        'template_title', v_tpl.title
      )
    );
  END IF;

  FOR v_cat IN SELECT jsonb_object_keys(COALESCE(v_tpl.category_distribution, '{}'::jsonb))
  LOOP
    v_cat_count := GREATEST(
      0,
      ROUND(v_total * COALESCE((v_tpl.category_distribution->>v_cat)::numeric, 0) / 100.0)::integer
    );
    FOR v_diff IN SELECT jsonb_object_keys(COALESCE(v_tpl.difficulty_distribution, '{"EASY":30,"MEDIUM":50,"HARD":20}'::jsonb))
    LOOP
      v_need := GREATEST(
        0,
        ROUND(v_cat_count * COALESCE((v_tpl.difficulty_distribution->>v_diff)::numeric, 0) / 100.0)::integer
      );
      SELECT COALESCE(array_agg(x.id), '{}') INTO v_picked
      FROM (
        SELECT q.id
        FROM public.questions q
        WHERE public.question_is_assessment_ready(q)
          AND upper(q.difficulty) = upper(v_diff)
          AND (
            lower(COALESCE(q.category, q.subject, '')) = lower(v_cat)
            OR lower(COALESCE(q.topic, '')) = lower(v_cat)
          )
          AND public.question_matches_template_taxonomy(
            q,
            COALESCE(v_tpl.role_slug, v_tpl.slug),
            v_categories,
            COALESCE(v_tpl.strict_taxonomy, true)
          )
          AND NOT (q.id = ANY (v_ids))
          AND (q.is_public = true OR q.uploaded_by = v_user OR q.created_by = v_user)
        ORDER BY md5(q.id::text || v_user::text || COALESCE(v_attempts, 0)::text || v_cat || v_diff)
        LIMIT v_need
      ) x;
      v_ids := v_ids || v_picked;
    END LOOP;
  END LOOP;

  v_fill := v_total - COALESCE(cardinality(v_ids), 0);
  IF v_fill > 0 THEN
    SELECT COALESCE(array_agg(x.id), '{}') INTO v_picked
    FROM (
      SELECT q.id
      FROM public.questions q
      WHERE public.question_is_assessment_ready(q)
        AND public.question_matches_template_taxonomy(
          q,
          COALESCE(v_tpl.role_slug, v_tpl.slug),
          v_categories,
          COALESCE(v_tpl.strict_taxonomy, true)
        )
        AND NOT (q.id = ANY (v_ids))
        AND (q.is_public = true OR q.uploaded_by = v_user OR q.created_by = v_user)
      ORDER BY md5(q.id::text || v_user::text || 'fill' || COALESCE(v_attempts, 0)::text)
      LIMIT v_fill
    ) x;
    v_ids := v_ids || v_picked;
  END IF;

  SELECT ARRAY(SELECT DISTINCT u FROM unnest(v_ids) AS u) INTO v_ids;

  IF COALESCE(v_tpl.randomize, true) THEN
    SELECT COALESCE(array_agg(u ORDER BY md5(u::text || v_user::text || 'order')), '{}')
      INTO v_ids
    FROM unnest(v_ids) AS u;
  END IF;

  IF COALESCE(cardinality(v_ids), 0) < v_total THEN
    PERFORM public.raise_assessment_start_error(
      'INSUFFICIENT_QUESTION_INVENTORY',
      'Not enough eligible questions to assemble this assessment',
      jsonb_build_object(
        'requested_count', v_total,
        'available_count', COALESCE(cardinality(v_ids), 0),
        'template_id', p_template_id,
        'template_slug', v_tpl.slug,
        'template_title', v_tpl.title
      )
    );
  END IF;

  v_ids := v_ids[1:v_total];

  BEGIN
    INSERT INTO public.mock_tests (
      user_id, test_name, config, question_ids, status, time_limit_minutes
    ) VALUES (
      v_user,
      v_tpl.title,
      jsonb_build_object(
        'template_id', p_template_id,
        'source', 'exam_template',
        'template_slug', v_tpl.slug,
        'marks_positive', v_tpl.marks_positive,
        'marks_negative', v_tpl.marks_negative,
        'passing_percentage', v_tpl.passing_percentage,
        'randomize_order', v_tpl.randomize,
        'idempotency_key', NULLIF(btrim(COALESCE(p_idempotency_key, '')), '')
      ),
      v_ids,
      'DRAFT',
      v_tpl.duration_minutes
    )
    RETURNING id INTO v_test_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id INTO v_test_id
      FROM public.mock_tests
      WHERE user_id = v_user
        AND config->>'template_id' = p_template_id::text
        AND status IN ('DRAFT', 'IN_PROGRESS')
      ORDER BY created_at DESC
      LIMIT 1;
      v_reused := true;
  END;

  RETURN jsonb_build_object(
    'test_id', v_test_id,
    'question_count', cardinality(v_ids),
    'duration_minutes', v_tpl.duration_minutes,
    'reused', COALESCE(v_reused, false),
    'template_slug', v_tpl.slug
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assemble_assessment_from_template(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assemble_assessment_from_template(uuid, text) TO authenticated;

COMMIT;
