-- Blueprint-aware assessment assembly + session-history role_slug + QA template seed.

BEGIN;

-- ── 1. Assemble with optional blueprint overrides ─────────────────────────────

CREATE OR REPLACE FUNCTION public.assemble_assessment_with_blueprint(
  p_template_id uuid,
  p_idempotency_key text DEFAULT NULL,
  p_category_weights jsonb DEFAULT NULL,
  p_role_slug text DEFAULT NULL,
  p_question_count integer DEFAULT NULL,
  p_selection_seed text DEFAULT NULL
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
  v_weights jsonb;
  v_role text;
  v_seed text;
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

  v_weights := COALESCE(p_category_weights, v_tpl.category_distribution);
  v_total := COALESCE(p_question_count, v_tpl.question_count);
  v_role := COALESCE(NULLIF(trim(p_role_slug), ''), v_tpl.role_slug, v_tpl.slug);
  v_seed := COALESCE(p_selection_seed, v_user::text);

  IF v_total IS NULL OR v_total <= 0
     OR v_weights IS NULL
     OR jsonb_typeof(v_weights) <> 'object'
     OR COALESCE(v_tpl.strict_taxonomy, true) IS NULL THEN
    PERFORM public.raise_assessment_start_error(
      'INVALID_ASSESSMENT_TEMPLATE',
      'Assessment template is invalid',
      jsonb_build_object('template_id', p_template_id, 'template_slug', v_tpl.slug)
    );
  END IF;

  SELECT ARRAY(
    SELECT jsonb_object_keys(COALESCE(v_weights, '{}'::jsonb))
  ) INTO v_categories;

  IF COALESCE(cardinality(v_categories), 0) < 1 THEN
    PERFORM public.raise_assessment_start_error(
      'INVALID_ASSESSMENT_TEMPLATE',
      'Assessment template is invalid',
      jsonb_build_object('template_id', p_template_id, 'template_slug', v_tpl.slug)
    );
  END IF;

  -- Expire stale non-paused live attempts before resume / attempt counting.
  UPDATE public.mock_tests
     SET status = 'ABANDONED',
         attempt_phase = 'INVALIDATED',
         updated_at = clock_timestamp(),
         paused_at = NULL
   WHERE user_id = v_user
     AND config->>'template_id' = p_template_id::text
     AND config->>'source' = 'exam_template'
     AND status = 'IN_PROGRESS'
     AND attempt_phase IS DISTINCT FROM 'PAUSED'
     AND expires_at IS NOT NULL
     AND expires_at < clock_timestamp() - interval '2 seconds';

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
           attempt_phase = 'INVALIDATED',
           updated_at = clock_timestamp(),
           paused_at = NULL
     WHERE id = v_existing_id;
    v_existing_id := NULL;
  END IF;

  -- Only completed attempts consume the attempt budget (live ones are resumed above).
  SELECT count(*) INTO v_attempts
  FROM public.mock_tests
  WHERE user_id = v_user
    AND config->>'template_id' = p_template_id::text
    AND status = 'COMPLETED';

  IF v_tpl.max_attempts IS NOT NULL AND v_attempts >= v_tpl.max_attempts THEN
    PERFORM public.raise_assessment_start_error(
      'MAX_ATTEMPTS_REACHED',
      'Maximum attempts reached for this assessment',
      jsonb_build_object(
        'template_id', p_template_id,
        'template_slug', v_tpl.slug,
        'template_title', v_tpl.title,
        'attempts_used', v_attempts,
        'max_attempts', v_tpl.max_attempts
      )
    );
  END IF;

  -- Pre-check inventory against effective role + any blueprint category.
  SELECT count(*)::integer INTO v_available
  FROM public.questions q
  WHERE public.question_is_assessment_ready(q)
    AND (q.is_public = true OR q.uploaded_by = v_user OR q.created_by = v_user)
    AND public.question_matches_template_taxonomy(
      q,
      v_role,
      v_categories,
      COALESCE(v_tpl.strict_taxonomy, true)
    );

  IF COALESCE(v_available, 0) < v_total THEN
    PERFORM public.raise_assessment_start_error(
      'INSUFFICIENT_QUESTION_INVENTORY',
      'Not enough eligible questions to assemble this assessment',
      jsonb_build_object(
        'requested_count', v_total,
        'available_count', COALESCE(v_available, 0),
        'template_id', p_template_id,
        'template_slug', v_tpl.slug,
        'template_title', v_tpl.title,
        'role_slug', v_role
      )
    );
  END IF;

  FOR v_cat IN SELECT jsonb_object_keys(COALESCE(v_weights, '{}'::jsonb))
  LOOP
    v_cat_count := GREATEST(
      0,
      ROUND(v_total * COALESCE((v_weights->>v_cat)::numeric, 0) / 100.0)::integer
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
            v_role,
            v_categories,
            COALESCE(v_tpl.strict_taxonomy, true)
          )
          AND NOT (q.id = ANY (v_ids))
          AND (q.is_public = true OR q.uploaded_by = v_user OR q.created_by = v_user)
        ORDER BY md5(q.id::text || COALESCE(p_selection_seed, v_user::text) || COALESCE(v_attempts, 0)::text || v_cat || v_diff)
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
          v_role,
          v_categories,
          COALESCE(v_tpl.strict_taxonomy, true)
        )
        AND NOT (q.id = ANY (v_ids))
        AND (q.is_public = true OR q.uploaded_by = v_user OR q.created_by = v_user)
      ORDER BY md5(q.id::text || COALESCE(p_selection_seed, v_user::text) || 'fill' || COALESCE(v_attempts, 0)::text)
      LIMIT v_fill
    ) x;
    v_ids := v_ids || v_picked;
  END IF;

  SELECT ARRAY(SELECT DISTINCT u FROM unnest(v_ids) AS u) INTO v_ids;

  IF COALESCE(v_tpl.randomize, true) THEN
    SELECT COALESCE(array_agg(u ORDER BY md5(u::text || v_seed || 'order')), '{}')
      INTO v_ids
    FROM unnest(v_ids) AS u;
  END IF;

  IF COALESCE(cardinality(v_ids), 0) < v_total THEN
    PERFORM public.raise_assessment_start_error(
      'CONTENT_INSUFFICIENT',
      'Not enough eligible questions to fill the assessment blueprint',
      jsonb_build_object(
        'requested_count', v_total,
        'available_count', COALESCE(cardinality(v_ids), 0),
        'template_id', p_template_id,
        'template_slug', v_tpl.slug,
        'template_title', v_tpl.title,
        'role_slug', v_role
      )
    );
  END IF;

  v_ids := v_ids[1:v_total];

  BEGIN
    INSERT INTO public.mock_tests (
      user_id, test_name, config, question_ids, status, attempt_phase, time_limit_minutes
    ) VALUES (
      v_user,
      v_tpl.title,
      jsonb_build_object(
        'template_id', p_template_id,
        'source', 'exam_template',
        'template_slug', v_tpl.slug,
        'role_slug', v_role,
        'category_weights', v_weights,
        'selection_seed', NULLIF(btrim(COALESCE(p_selection_seed, '')), ''),
        'marks_positive', v_tpl.marks_positive,
        'marks_negative', v_tpl.marks_negative,
        'passing_percentage', v_tpl.passing_percentage,
        'randomize_order', v_tpl.randomize,
        'idempotency_key', NULLIF(btrim(COALESCE(p_idempotency_key, '')), '')
      ),
      v_ids,
      'DRAFT',
      'NOT_STARTED',
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
      RETURN jsonb_build_object(
        'test_id', v_test_id,
        'question_count', cardinality(v_ids),
        'duration_minutes', v_tpl.duration_minutes,
        'reused', true,
        'template_slug', v_tpl.slug
      );
  END;

  RETURN jsonb_build_object(
    'test_id', v_test_id,
    'question_count', cardinality(v_ids),
    'duration_minutes', v_tpl.duration_minutes,
    'reused', false,
    'template_slug', v_tpl.slug
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assemble_assessment_with_blueprint(uuid, text, jsonb, text, integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assemble_assessment_with_blueprint(uuid, text, jsonb, text, integer, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.assemble_assessment_with_blueprint(uuid, text, jsonb, text, integer, text) IS
  'Assemble a mock_tests attempt from an exam template with optional blueprint overrides (weights, role, count, selection seed).';

-- ── 2. Session history: expose assessment role_slug from mock_tests.config ────

CREATE OR REPLACE FUNCTION public.get_session_history(
  p_types text[] DEFAULT NULL,
  p_statuses text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_score_state text DEFAULT NULL,
  p_debrief_state text DEFAULT NULL,
  p_sort text DEFAULT 'newest',
  p_cursor text DEFAULT NULL,
  p_page_size int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 50);
  v_sort text := lower(coalesce(nullif(btrim(p_sort), ''), 'newest'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_score_state text := lower(nullif(btrim(coalesce(p_score_state, '')), ''));
  v_debrief_state text := lower(nullif(btrim(coalesce(p_debrief_state, '')), ''));
  v_cursor_ts timestamptz;
  v_cursor_kind text;
  v_cursor_id uuid;
  v_rows jsonb := '[]'::jsonb;
  v_page jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor text := NULL;
  v_last jsonb;
  v_len int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_AUTHENTICATED',
      'message', 'Sign in to load session history.'
    );
  END IF;

  IF p_cursor IS NOT NULL AND btrim(p_cursor) <> '' THEN
    BEGIN
      v_cursor_ts := split_part(p_cursor, '|', 1)::timestamptz;
      v_cursor_kind := split_part(p_cursor, '|', 2);
      v_cursor_id := NULLIF(split_part(p_cursor, '|', 3), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'INVALID_CURSOR',
        'message', 'Pagination cursor is invalid.'
      );
    END;
  END IF;

  WITH interview AS (
    SELECT
      s.id AS session_id,
      s.id AS source_id,
      'interview'::text AS source_kind,
      s.user_id,
      CASE
        WHEN s.type = 'mock' THEN 'mock_interview'
        WHEN s.type IN ('live', 'rehearsal', 'warmup') THEN 'practice_coach'
        ELSE 'other_practice'
      END AS session_type,
      CASE
        WHEN s.type = 'live' THEN 'live_copilot'
        WHEN s.type = 'rehearsal' THEN 'rehearsal'
        WHEN s.type = 'warmup' THEN 'warmup'
        WHEN s.type = 'room' THEN 'room'
        ELSE NULL
      END AS session_subtype,
      COALESCE(NULLIF(btrim(s.title), ''), initcap(s.type::text) || ' session') AS title,
      NULLIF(btrim(s.title), '') AS role,
      NULL::text AS company,
      NULL::text AS exam_name,
      NULL::text AS assessment_name,
      CASE
        WHEN s.lifecycle_status = 'CANCELLED' THEN 'cancelled'
        WHEN s.lifecycle_status = 'EXPIRED' THEN 'expired'
        WHEN s.status = 'completed' OR s.lifecycle_status = 'COMPLETED' THEN 'completed'
        WHEN s.status = 'paused' THEN 'paused'
        WHEN s.status IN ('active', 'pending') THEN 'active'
        WHEN s.status = 'abandoned' THEN 'incomplete'
        ELSE 'incomplete'
      END AS status,
      COALESCE(s.lifecycle_status, s.status::text) AS source_status,
      s.started_at,
      COALESCE(s.updated_at, s.ended_at, s.started_at, s.created_at) AS last_activity_at,
      s.ended_at,
      s.duration_seconds,
      s.answers_generated::int AS answered_count,
      s.questions_asked AS total_question_count,
      COALESCE(sc.overall_score, s.overall_score) AS score,
      100::numeric AS score_maximum,
      CASE WHEN COALESCE(sc.overall_score, s.overall_score) IS NULL THEN NULL ELSE 'percent' END AS score_unit,
      CASE
        WHEN COALESCE(sc.overall_score, s.overall_score) IS NULL THEN NULL
        ELSE round(COALESCE(sc.overall_score, s.overall_score))::text || '%'
      END AS result_label,
      CASE
        WHEN sd.id IS NOT NULL THEN 'available'
        WHEN s.type IN ('mock', 'live', 'rehearsal', 'warmup') AND s.status = 'completed' THEN 'not_requested'
        ELSE 'not_eligible'
      END AS debrief_status,
      sd.id AS debrief_id,
      '/app/sessions/' || s.id::text AS detail_route,
      CASE
        WHEN s.type = 'mock' THEN '/app/mock/session/' || s.id::text
        WHEN s.type = 'live' THEN '/app/live'
        ELSE '/app/sessions/' || s.id::text
      END AS source_route,
      s.created_at,
      s.updated_at
    FROM public.sessions s
    LEFT JOIN LATERAL (
      SELECT scx.overall_score
      FROM public.scorecards scx
      WHERE scx.session_id = s.id AND scx.user_id = s.user_id
      ORDER BY scx.created_at DESC NULLS LAST
      LIMIT 1
    ) sc ON true
    LEFT JOIN LATERAL (
      SELECT d.id
      FROM public.session_debriefs d
      WHERE d.session_id = s.id AND d.user_id = s.user_id
      ORDER BY d.created_at DESC NULLS LAST
      LIMIT 1
    ) sd ON true
    WHERE s.user_id = v_uid
      AND s.deleted_at IS NULL
  ),
  exams AS (
    SELECT
      mt.id AS session_id,
      mt.id AS source_id,
      'mock_test'::text AS source_kind,
      mt.user_id,
      CASE
        WHEN coalesce(mt.config->>'source', '') = 'exam_template' OR (mt.config ? 'template_id')
          THEN 'assessment'
        ELSE 'government_exam'
      END AS session_type,
      -- For career assessments, carry assessment_objective in session_subtype for UI context.
      CASE
        WHEN coalesce(mt.config->>'source', '') = 'exam_template' OR (mt.config ? 'template_id')
          THEN NULLIF(mt.config->>'assessment_objective', '')
        ELSE NULL
      END AS session_subtype,
      COALESCE(NULLIF(btrim(mt.test_name), ''), 'Exam attempt') AS title,
      NULLIF(mt.config->>'role_slug', '') AS role,
      NULL::text AS company,
      CASE
        WHEN coalesce(mt.config->>'source', '') = 'exam_template' OR (mt.config ? 'template_id') THEN NULL
        ELSE NULLIF(btrim(mt.test_name), '')
      END AS exam_name,
      CASE
        WHEN coalesce(mt.config->>'source', '') = 'exam_template' OR (mt.config ? 'template_id')
          THEN NULLIF(btrim(mt.test_name), '')
        ELSE NULL
      END AS assessment_name,
      CASE upper(mt.status)
        WHEN 'DRAFT' THEN 'draft'
        WHEN 'IN_PROGRESS' THEN 'active'
        WHEN 'COMPLETED' THEN 'completed'
        WHEN 'ABANDONED' THEN 'incomplete'
        ELSE lower(mt.status)
      END AS status,
      mt.status AS source_status,
      mt.started_at,
      COALESCE(mt.submitted_at, mt.updated_at, mt.created_at) AS last_activity_at,
      mt.submitted_at AS ended_at,
      CASE
        WHEN mt.started_at IS NOT NULL AND mt.submitted_at IS NOT NULL
          THEN GREATEST(0, EXTRACT(EPOCH FROM (mt.submitted_at - mt.started_at))::int)
        WHEN mt.time_limit_minutes IS NOT NULL THEN mt.time_limit_minutes * 60
        ELSE NULL
      END AS duration_seconds,
      (
        SELECT COUNT(*)::int FROM public.test_responses tr
        WHERE tr.test_id = mt.id AND tr.user_id = mt.user_id AND tr.answered_at IS NOT NULL
      ) AS answered_count,
      COALESCE(cardinality(mt.question_ids), 0) AS total_question_count,
      COALESCE(ta.total_score, mt.overall_score) AS score,
      ta.max_score AS score_maximum,
      CASE
        WHEN COALESCE(ta.total_score, mt.overall_score) IS NULL THEN NULL
        WHEN ta.max_score IS NOT NULL THEN 'marks'
        ELSE 'percent'
      END AS score_unit,
      CASE
        WHEN COALESCE(ta.total_score, mt.overall_score) IS NULL THEN NULL
        WHEN ta.max_score IS NOT NULL
          THEN round(COALESCE(ta.total_score, mt.overall_score))::text || '/' || round(ta.max_score)::text
        ELSE round(COALESCE(ta.total_score, mt.overall_score))::text || '%'
      END AS result_label,
      'not_eligible'::text AS debrief_status,
      NULL::uuid AS debrief_id,
      CASE
        WHEN coalesce(mt.config->>'source', '') = 'exam_template' OR (mt.config ? 'template_id')
          THEN '/app/assessments/results/' || mt.id::text
        ELSE '/app/mock-test/results/' || mt.id::text
      END AS detail_route,
      CASE
        WHEN coalesce(mt.config->>'source', '') = 'exam_template' OR (mt.config ? 'template_id')
          THEN '/app/assessments/session/' || mt.id::text
        ELSE '/app/mock-test/session/' || mt.id::text
      END AS source_route,
      COALESCE(mt.created_at, mt.started_at, now()) AS created_at,
      COALESCE(mt.updated_at, mt.submitted_at, mt.created_at, now()) AS updated_at
    FROM public.mock_tests mt
    LEFT JOIN LATERAL (
      SELECT a.total_score, a.max_score
      FROM public.test_analyses a
      WHERE a.test_id = mt.id AND a.user_id = mt.user_id
      ORDER BY a.created_at DESC NULLS LAST
      LIMIT 1
    ) ta ON true
    WHERE mt.user_id = v_uid
  ),
  workspace AS (
    SELECT
      p.id AS session_id,
      p.id AS source_id,
      'practice_workspace'::text AS source_kind,
      p.user_id,
      'practice_workspace'::text AS session_type,
      NULL::text AS session_subtype,
      COALESCE(NULLIF(btrim(p.role), ''), initcap(p.interview_type) || ' practice') AS title,
      NULLIF(btrim(p.role), '') AS role,
      NULL::text AS company,
      NULL::text AS exam_name,
      NULL::text AS assessment_name,
      CASE p.status
        WHEN 'active' THEN 'active'
        WHEN 'completed' THEN 'completed'
        WHEN 'expired' THEN 'expired'
        ELSE 'incomplete'
      END AS status,
      p.status AS source_status,
      p.started_at,
      COALESCE(p.ended_at, p.started_at, p.created_at) AS last_activity_at,
      p.ended_at,
      NULLIF(p.elapsed_seconds, 0) AS duration_seconds,
      CASE
        WHEN jsonb_typeof(p.answers) = 'object' THEN (SELECT COUNT(*)::int FROM jsonb_object_keys(p.answers))
        WHEN jsonb_typeof(p.answers) = 'array' THEN jsonb_array_length(p.answers)
        ELSE NULL
      END AS answered_count,
      CASE
        WHEN jsonb_typeof(p.question_order) = 'array' THEN jsonb_array_length(p.question_order)
        ELSE NULL
      END AS total_question_count,
      CASE
        WHEN p.scores IS NULL THEN NULL
        WHEN jsonb_typeof(p.scores) = 'number' THEN (p.scores #>> '{}')::numeric
        WHEN p.scores ? 'overall' THEN NULLIF(p.scores->>'overall', '')::numeric
        ELSE NULL
      END AS score,
      100::numeric AS score_maximum,
      CASE
        WHEN p.scores IS NULL THEN NULL
        WHEN jsonb_typeof(p.scores) = 'number' OR (p.scores ? 'overall') THEN 'percent'
        ELSE NULL
      END AS score_unit,
      CASE
        WHEN p.scores IS NULL THEN NULL
        WHEN jsonb_typeof(p.scores) = 'number' THEN round((p.scores #>> '{}')::numeric)::text || '%'
        WHEN p.scores ? 'overall' AND NULLIF(p.scores->>'overall', '') IS NOT NULL
          THEN round((p.scores->>'overall')::numeric)::text || '%'
        ELSE NULL
      END AS result_label,
      'not_eligible'::text AS debrief_status,
      NULL::uuid AS debrief_id,
      '/app/practice-workspace?session=' || p.id::text AS detail_route,
      '/app/practice-workspace?session=' || p.id::text AS source_route,
      p.created_at,
      COALESCE(p.ended_at, p.created_at) AS updated_at
    FROM public.practice_workspace_sessions p
    WHERE p.user_id = v_uid
  ),
  coding AS (
    SELECT
      c.id AS session_id,
      c.id AS source_id,
      'coding_submission'::text AS source_kind,
      c.user_id,
      'coding_assessment'::text AS session_type,
      NULL::text AS session_subtype,
      COALESCE(NULLIF(btrim(q.title), ''), 'Coding submission') AS title,
      NULL::text AS role,
      NULL::text AS company,
      NULL::text AS exam_name,
      NULL::text AS assessment_name,
      CASE c.status
        WHEN 'scored' THEN 'completed'
        WHEN 'submitted' THEN 'submitted'
        WHEN 'pending_review' THEN 'evaluation_pending'
        WHEN 'rejected' THEN 'failed'
        WHEN 'limit_exceeded' THEN 'failed'
        ELSE 'submitted'
      END AS status,
      c.status AS source_status,
      c.submitted_at AS started_at,
      c.submitted_at AS last_activity_at,
      c.submitted_at AS ended_at,
      NULL::int AS duration_seconds,
      c.passed_tests AS answered_count,
      CASE
        WHEN c.passed_tests IS NULL AND c.failed_tests IS NULL THEN NULL
        ELSE COALESCE(c.passed_tests, 0) + COALESCE(c.failed_tests, 0)
      END AS total_question_count,
      c.score,
      100::numeric AS score_maximum,
      CASE
        WHEN c.passed_tests IS NOT NULL OR c.failed_tests IS NOT NULL THEN 'tests'
        WHEN c.score IS NOT NULL THEN 'percent'
        ELSE NULL
      END AS score_unit,
      CASE
        WHEN c.passed_tests IS NOT NULL OR c.failed_tests IS NOT NULL
          THEN COALESCE(c.passed_tests, 0)::text || '/' ||
               (COALESCE(c.passed_tests, 0) + COALESCE(c.failed_tests, 0))::text || ' tests'
        WHEN c.score IS NOT NULL THEN round(c.score)::text || '%'
        ELSE NULL
      END AS result_label,
      'not_eligible'::text AS debrief_status,
      NULL::uuid AS debrief_id,
      '/app/coding/' || c.question_id::text AS detail_route,
      '/app/coding/' || c.question_id::text AS source_route,
      c.submitted_at AS created_at,
      c.submitted_at AS updated_at
    FROM public.coding_submissions c
    LEFT JOIN public.coding_questions q ON q.id = c.question_id
    WHERE c.user_id = v_uid
  ),
  unified AS (
    SELECT * FROM interview
    UNION ALL SELECT * FROM exams
    UNION ALL SELECT * FROM workspace
    UNION ALL SELECT * FROM coding
  ),
  filtered AS (
    SELECT u.*
    FROM unified u
    WHERE (p_types IS NULL OR cardinality(p_types) = 0
           OR u.session_type = ANY (p_types)
           OR (u.session_subtype IS NOT NULL AND u.session_subtype = ANY (p_types)))
      AND (p_statuses IS NULL OR cardinality(p_statuses) = 0 OR u.status = ANY (p_statuses))
      AND (p_date_from IS NULL OR u.last_activity_at >= p_date_from)
      AND (p_date_to IS NULL OR u.last_activity_at <= p_date_to)
      AND (
        v_search IS NULL
        OR u.title ILIKE '%' || v_search || '%'
        OR coalesce(u.role, '') ILIKE '%' || v_search || '%'
        OR coalesce(u.company, '') ILIKE '%' || v_search || '%'
        OR coalesce(u.exam_name, '') ILIKE '%' || v_search || '%'
        OR coalesce(u.assessment_name, '') ILIKE '%' || v_search || '%'
        OR u.session_type ILIKE '%' || v_search || '%'
      )
      AND (
        v_score_state IS NULL OR v_score_state IN ('', 'all')
        OR (v_score_state = 'scored' AND u.score IS NOT NULL)
        OR (v_score_state = 'not_scored' AND u.score IS NULL)
      )
      AND (
        v_debrief_state IS NULL OR v_debrief_state IN ('', 'all')
        OR u.debrief_status = v_debrief_state
      )
      AND (
        v_cursor_ts IS NULL OR v_cursor_id IS NULL
        OR (
          CASE
            WHEN v_sort = 'oldest' THEN
              (u.last_activity_at > v_cursor_ts)
              OR (u.last_activity_at = v_cursor_ts AND u.source_kind > v_cursor_kind)
              OR (u.last_activity_at = v_cursor_ts AND u.source_kind = v_cursor_kind AND u.source_id > v_cursor_id)
            ELSE
              (u.last_activity_at < v_cursor_ts)
              OR (u.last_activity_at = v_cursor_ts AND u.source_kind > v_cursor_kind)
              OR (u.last_activity_at = v_cursor_ts AND u.source_kind = v_cursor_kind AND u.source_id > v_cursor_id)
          END
        )
      )
  ),
  ordered AS (
    SELECT
      session_id AS "sessionId",
      source_id AS "sourceId",
      source_kind AS "sourceKind",
      user_id AS "userId",
      session_type AS "sessionType",
      session_subtype AS "sessionSubtype",
      title,
      role,
      company,
      exam_name AS "examName",
      assessment_name AS "assessmentName",
      status,
      source_status AS "sourceStatus",
      started_at AS "startedAt",
      last_activity_at AS "lastActivityAt",
      ended_at AS "endedAt",
      duration_seconds AS "durationSeconds",
      answered_count AS "answeredCount",
      total_question_count AS "totalQuestionCount",
      score,
      score_maximum AS "scoreMaximum",
      score_unit AS "scoreUnit",
      result_label AS "resultLabel",
      debrief_status AS "debriefStatus",
      debrief_id AS "debriefId",
      detail_route AS "detailRoute",
      source_route AS "sourceRoute",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM filtered
    ORDER BY
      CASE WHEN v_sort = 'oldest' THEN last_activity_at END ASC NULLS LAST,
      CASE WHEN v_sort IN ('newest', 'highest_score', 'lowest_score', 'longest', 'shortest')
           OR v_sort IS NULL THEN last_activity_at END DESC NULLS LAST,
      CASE WHEN v_sort = 'highest_score' THEN score END DESC NULLS LAST,
      CASE WHEN v_sort = 'lowest_score' THEN score END ASC NULLS LAST,
      CASE WHEN v_sort = 'longest' THEN duration_seconds END DESC NULLS LAST,
      CASE WHEN v_sort = 'shortest' THEN duration_seconds END ASC NULLS LAST,
      source_kind ASC,
      source_id ASC
    LIMIT v_limit + 1
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
  INTO v_rows
  FROM ordered o;

  v_len := jsonb_array_length(COALESCE(v_rows, '[]'::jsonb));
  IF v_len > v_limit THEN
    v_has_more := true;
    v_page := (
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
      FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS t(elem, ord)
      WHERE ord <= v_limit
    );
    v_last := v_page -> (v_limit - 1);
    v_next_cursor :=
      coalesce(v_last->>'lastActivityAt', '') || '|' ||
      coalesce(v_last->>'sourceKind', '') || '|' ||
      coalesce(v_last->>'sourceId', '');
  ELSE
    v_page := COALESCE(v_rows, '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'items', v_page,
    'nextCursor', v_next_cursor,
    'hasMore', v_has_more
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok', false,
    'code', 'QUERY_FAILED',
    'message', 'We couldn’t load your session history.',
    'detail', SQLERRM
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_session_history(
  text[], text[], text, timestamptz, timestamptz, text, text, text, text, int
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_session_history(
  text[], text[], text, timestamptz, timestamptz, text, text, text, text, int
) TO authenticated;

COMMENT ON FUNCTION public.get_session_history IS
  'Owner-scoped Session History timeline normalizing interviews, exams, assessments, workspace, and coding.';

-- ── 3. Seed QA Engineer exam template ─────────────────────────────────────────

INSERT INTO public.exam_templates (
  slug, title, description, question_count, duration_minutes, passing_percentage,
  marks_positive, marks_negative, randomize, max_attempts,
  difficulty_distribution, category_distribution, is_published, role_slug, strict_taxonomy, is_active
)
VALUES (
  'qa-engineer',
  'QA Engineer Assessment',
  'Test design, API testing, SQL validation, and quality fundamentals.',
  6, 15, 60, 1, 0, true, NULL,
  '{"EASY":30,"MEDIUM":50,"HARD":20}'::jsonb,
  '{"aptitude":30,"backend":25,"sql":25,"javascript":20}'::jsonb,
  true, 'qa-engineer', true, true
)
ON CONFLICT (slug) DO UPDATE SET
  category_distribution = EXCLUDED.category_distribution,
  role_slug = EXCLUDED.role_slug,
  is_published = true,
  is_active = true,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  question_count = EXCLUDED.question_count,
  duration_minutes = EXCLUDED.duration_minutes,
  difficulty_distribution = EXCLUDED.difficulty_distribution,
  updated_at = clock_timestamp();

COMMIT;
