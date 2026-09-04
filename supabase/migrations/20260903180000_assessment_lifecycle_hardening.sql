-- TC-MOD-018: assessment inventory, attempt counting, autosave membership, pause timer.
BEGIN;

-- ── 1. HR inventory: keep question_count=5; seed ≥3 more ready HR items ──────

-- Seed as migration role: temporarily disable client-facing protect/validate
-- triggers so approved+verified+valid HR items can be published atomically.
ALTER TABLE public.questions DISABLE TRIGGER questions_protect_assessment_taxonomy;
ALTER TABLE public.questions DISABLE TRIGGER questions_validate_publication;

INSERT INTO public.questions (
  question_text, question_type, options, correct_answer, explanation,
  subject, topic, category, difficulty, exam_type, source, source_paper,
  marks_positive, marks_negative, is_public, is_verified,
  license_type, copyright_status, publish_status, tags,
  eligible_roles, cross_functional, review_status, validation_status
)
SELECT v.question_text, v.question_type, v.options::jsonb, v.correct_answer, v.explanation,
       v.subject, v.topic, v.category, v.difficulty, 'CLARIFY_ORIGINAL', 'ORIGINAL',
       'clarify_original_seed_v3_hr',
       4, 1, true, true, 'ORIGINAL', 'ORIGINAL', 'published', v.tags,
       v.eligible_roles, false, 'approved', 'valid'
FROM (
  VALUES
    (
      'When an interviewer asks “Tell me about yourself,” what is the strongest structure?',
      'MCQ',
      '[{"label":"A","text":"A full life history from childhood"},{"label":"B","text":"Present role, relevant past, and future fit"},{"label":"C","text":"Only hobbies and interests"},{"label":"D","text":"A critique of previous employers"}]',
      'B',
      'A concise present–past–future pitch keeps the answer professional and role-relevant.',
      'HR', 'Introduction', 'HR', 'EASY', ARRAY['hr','interview']::text[],
      ARRAY['hr-interview']::text[]
    ),
    (
      'Which response best handles a question about a past workplace conflict?',
      'MCQ',
      '[{"label":"A","text":"Blame the other person and move on"},{"label":"B","text":"Describe the situation, your actions, and the constructive outcome"},{"label":"C","text":"Say you never have conflicts"},{"label":"D","text":"Refuse to answer because it is confidential"}]',
      'B',
      'Interviewers look for ownership, communication, and a constructive resolution.',
      'HR', 'Conflict', 'HR', 'MEDIUM', ARRAY['hr','behavioral']::text[],
      ARRAY['hr-interview']::text[]
    ),
    (
      'What is the most professional way to discuss salary expectations early in screening?',
      'MCQ',
      '[{"label":"A","text":"Give a researched range and ask about the role band"},{"label":"B","text":"Demand the highest number immediately"},{"label":"C","text":"Say money does not matter at all"},{"label":"D","text":"Ask the interviewer for their personal salary"}]',
      'A',
      'A researched range shows preparation while leaving room for mutual fit.',
      'HR', 'Compensation', 'HR', 'MEDIUM', ARRAY['hr','screening']::text[],
      ARRAY['hr-interview']::text[]
    ),
    (
      'Why do interviewers ask about gaps between jobs?',
      'MCQ',
      '[{"label":"A","text":"To trap candidates into failing the interview"},{"label":"B","text":"To understand context, growth, and readiness to return"},{"label":"C","text":"To compare hobbies across applicants"},{"label":"D","text":"To replace technical screening entirely"}]',
      'B',
      'Honest context about learning, caregiving, or transitions reassures interviewers about readiness.',
      'HR', 'CareerGaps', 'HR', 'EASY', ARRAY['hr','career']::text[],
      ARRAY['hr-interview']::text[]
    )
) AS v(
  question_text, question_type, options, correct_answer, explanation,
  subject, topic, category, difficulty, tags, eligible_roles
)
WHERE NOT EXISTS (
  SELECT 1 FROM public.questions q WHERE q.source_paper = 'clarify_original_seed_v3_hr' LIMIT 1
);

ALTER TABLE public.questions ENABLE TRIGGER questions_protect_assessment_taxonomy;
ALTER TABLE public.questions ENABLE TRIGGER questions_validate_publication;

-- Ensure hr-interview template stays at 5 questions (authoritative definition).
UPDATE public.exam_templates
SET question_count = 5,
    category_distribution = '{"HR":100}'::jsonb,
    is_active = true,
    is_published = true,
    updated_at = clock_timestamp()
WHERE slug = 'hr-interview';

-- ── 2. Pause accrual columns ────────────────────────────────────────────────

ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_paused_ms bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.mock_tests.paused_at IS
  'When set, attempt_phase is PAUSED and remaining time is frozen at expires_at - paused_at.';
COMMENT ON COLUMN public.mock_tests.total_paused_ms IS
  'Accumulated pause duration; expires_at is extended on each resume by the latest pause interval.';

-- ── 3. Shared inventory helper (availability + assemble) ────────────────────

CREATE OR REPLACE FUNCTION public.count_eligible_assessment_questions(
  p_template_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tpl public.exam_templates%ROWTYPE;
  v_categories text[];
  v_count integer := 0;
BEGIN
  SELECT * INTO v_tpl FROM public.exam_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT ARRAY(
    SELECT jsonb_object_keys(COALESCE(v_tpl.category_distribution, '{}'::jsonb))
  ) INTO v_categories;

  SELECT count(*)::integer INTO v_count
  FROM public.questions q
  WHERE public.question_is_assessment_ready(q)
    AND (q.is_public = true OR q.uploaded_by = p_user_id OR q.created_by = p_user_id)
    AND public.question_matches_template_taxonomy(
      q,
      COALESCE(v_tpl.role_slug, v_tpl.slug),
      v_categories,
      COALESCE(v_tpl.strict_taxonomy, true)
    );

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.count_eligible_assessment_questions(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_eligible_assessment_questions(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assessment_template_availability(
  p_template_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_tpl public.exam_templates%ROWTYPE;
  v_available integer := 0;
  v_requested integer := 0;
  v_attempts integer := 0;
  v_resumable uuid;
  v_startable boolean := false;
  v_code text := NULL;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'UNAUTHORIZED',
      'startable', false
    );
  END IF;

  SELECT * INTO v_tpl FROM public.exam_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ASSESSMENT_NOT_FOUND',
      'template_id', p_template_id,
      'startable', false
    );
  END IF;

  IF COALESCE(v_tpl.is_published, false) IS NOT TRUE OR COALESCE(v_tpl.is_active, true) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', true,
      'code', 'ASSESSMENT_NOT_AVAILABLE',
      'template_id', p_template_id,
      'template_slug', v_tpl.slug,
      'template_title', v_tpl.title,
      'requested', COALESCE(v_tpl.question_count, 0),
      'available', 0,
      'shortage', COALESCE(v_tpl.question_count, 0),
      'attempts_used', 0,
      'max_attempts', v_tpl.max_attempts,
      'startable', false
    );
  END IF;

  v_requested := COALESCE(v_tpl.question_count, 0);
  v_available := public.count_eligible_assessment_questions(p_template_id, v_user);

  -- Abandon expired live attempts so they do not block resume/start forever.
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

  SELECT id INTO v_resumable
  FROM public.mock_tests
  WHERE user_id = v_user
    AND config->>'template_id' = p_template_id::text
    AND config->>'source' = 'exam_template'
    AND status IN ('DRAFT', 'IN_PROGRESS')
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT count(*)::integer INTO v_attempts
  FROM public.mock_tests
  WHERE user_id = v_user
    AND config->>'template_id' = p_template_id::text
    AND status = 'COMPLETED';

  IF v_resumable IS NOT NULL THEN
    v_startable := true;
  ELSIF v_tpl.max_attempts IS NOT NULL AND v_attempts >= v_tpl.max_attempts THEN
    v_code := 'MAX_ATTEMPTS_REACHED';
    v_startable := false;
  ELSIF v_available < v_requested THEN
    v_code := 'INSUFFICIENT_QUESTION_INVENTORY';
    v_startable := false;
  ELSE
    v_startable := true;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'template_id', p_template_id,
    'template_slug', v_tpl.slug,
    'template_title', v_tpl.title,
    'requested', v_requested,
    'available', v_available,
    'shortage', GREATEST(0, v_requested - v_available),
    'attempts_used', v_attempts,
    'max_attempts', v_tpl.max_attempts,
    'resumable_test_id', v_resumable,
    'startable', v_startable,
    'code', v_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assessment_template_availability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assessment_template_availability(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assessment_templates_availability(
  p_template_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'items', '[]'::jsonb);
  END IF;

  FOREACH v_id IN ARRAY COALESCE(p_template_ids, '{}'::uuid[])
  LOOP
    v_items := v_items || jsonb_build_array(public.assessment_template_availability(v_id));
  END LOOP;

  RETURN jsonb_build_object('success', true, 'items', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.assessment_templates_availability(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assessment_templates_availability(uuid[]) TO authenticated, service_role;

-- ── 4. Assemble: shared inventory + COMPLETED-only attempt cap + stale abandon ─

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

  v_available := public.count_eligible_assessment_questions(p_template_id, v_user);

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
      user_id, test_name, config, question_ids, status, attempt_phase, time_limit_minutes
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

REVOKE ALL ON FUNCTION public.assemble_assessment_from_template(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assemble_assessment_from_template(uuid, text) TO authenticated, service_role;

-- ── 5. Fix save_owned_test_answer uuid[] membership + pause-aware expiry ────

CREATE OR REPLACE FUNCTION public.save_owned_test_answer(
  p_test_id uuid,
  p_question_id uuid,
  p_user_answer text,
  p_is_attempted boolean,
  p_is_marked_review boolean,
  p_time_spent_seconds integer,
  p_client_updated_at timestamptz,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test public.mock_tests;
  v_existing public.test_responses;
  v_now timestamptz := clock_timestamp();
  v_client timestamptz := COALESCE(p_client_updated_at, v_now);
  v_phase text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_test
    FROM public.mock_tests
   WHERE id = p_test_id AND user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;

  -- question_ids is uuid[]; comparing text to uuid[] raises and became HTTP 500.
  IF NOT (p_question_id = ANY (COALESCE(v_test.question_ids, ARRAY[]::uuid[]))) THEN
    RETURN jsonb_build_object('success', false, 'code', 'QUESTION_NOT_IN_ATTEMPT');
  END IF;

  IF v_test.status = 'ABANDONED' OR v_test.attempt_phase = 'INVALIDATED' THEN
    RETURN jsonb_build_object('success', false, 'code', 'ATTEMPT_INVALIDATED');
  END IF;
  IF v_test.status = 'COMPLETED'
     OR v_test.attempt_phase IN ('SUBMITTING', 'SUBMITTED', 'EVALUATING', 'RESULT_AVAILABLE', 'AUTO_SUBMITTED') THEN
    RETURN jsonb_build_object('success', false, 'code', 'SUBMISSION_CONFLICT');
  END IF;

  v_phase := COALESCE(v_test.attempt_phase, 'ACTIVE');
  IF v_test.status <> 'IN_PROGRESS' OR v_test.started_at IS NULL
     OR v_phase NOT IN ('ACTIVE', 'PAUSED', 'CONNECTION_LOST', 'RESTORING') THEN
    RETURN jsonb_build_object('success', false, 'code', 'ATTEMPT_NOT_STARTED');
  END IF;

  -- While PAUSED the official clock is frozen; do not expire mid-pause.
  IF v_phase <> 'PAUSED'
     AND v_test.expires_at IS NOT NULL
     AND v_test.expires_at < v_now - interval '2 seconds' THEN
    RETURN jsonb_build_object('success', false, 'code', 'ATTEMPT_EXPIRED');
  END IF;

  IF v_client > v_now + interval '5 minutes' OR v_client < v_test.started_at - interval '5 minutes' THEN
    RETURN jsonb_build_object('success', false, 'code', 'CLIENT_CLOCK_INVALID');
  END IF;

  SELECT * INTO v_existing
    FROM public.test_responses
   WHERE test_id = p_test_id AND question_id = p_question_id AND user_id = auth.uid()
   FOR UPDATE;

  IF FOUND AND (
    (p_expected_version IS NOT NULL AND p_expected_version <> COALESCE(v_existing.answer_version, 0))
    OR (p_expected_version IS NULL AND v_existing.client_updated_at IS NOT NULL
        AND v_existing.client_updated_at > v_client)
  ) THEN
    RETURN jsonb_build_object(
      'success', true, 'stale', true, 'code', 'VERSION_CONFLICT',
      'answer_version', COALESCE(v_existing.answer_version, 0),
      'client_updated_at', v_existing.client_updated_at
    );
  END IF;

  INSERT INTO public.test_responses (
    test_id, user_id, question_id, user_answer, is_attempted, is_marked_review,
    time_spent_seconds, client_updated_at, answer_version, updated_at, answered_at
  ) VALUES (
    p_test_id, auth.uid(), p_question_id, NULLIF(p_user_answer, ''),
    COALESCE(p_is_attempted, false), COALESCE(p_is_marked_review, false),
    GREATEST(0, COALESCE(p_time_spent_seconds, 0)), v_client, 1, v_now,
    CASE WHEN COALESCE(p_is_attempted, false) THEN v_now ELSE NULL END
  )
  ON CONFLICT (test_id, question_id) DO UPDATE SET
    user_answer = EXCLUDED.user_answer,
    is_attempted = EXCLUDED.is_attempted,
    is_marked_review = EXCLUDED.is_marked_review,
    time_spent_seconds = GREATEST(public.test_responses.time_spent_seconds, EXCLUDED.time_spent_seconds),
    client_updated_at = EXCLUDED.client_updated_at,
    answer_version = public.test_responses.answer_version + 1,
    updated_at = v_now,
    answered_at = CASE WHEN EXCLUDED.is_attempted
      THEN COALESCE(public.test_responses.answered_at, v_now)
      ELSE public.test_responses.answered_at END
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object(
    'success', true, 'stale', false,
    'answer_version', v_existing.answer_version,
    'client_updated_at', v_existing.client_updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_owned_test_answer(
  uuid, uuid, text, boolean, boolean, integer, timestamptz, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_owned_test_answer(
  uuid, uuid, text, boolean, boolean, integer, timestamptz, integer
) TO authenticated, service_role;

-- ── 6. Pause / resume RPCs (server-authoritative clock freeze) ──────────────

CREATE OR REPLACE FUNCTION public.pause_owned_mock_test(p_test_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test public.mock_tests;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_test FROM public.mock_tests
   WHERE id = p_test_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;
  IF v_test.status <> 'IN_PROGRESS' OR v_test.started_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'ATTEMPT_NOT_STARTED');
  END IF;
  IF v_test.attempt_phase IN ('SUBMITTING', 'SUBMITTED', 'EVALUATING', 'RESULT_AVAILABLE', 'AUTO_SUBMITTED', 'INVALIDATED')
     OR v_test.status IN ('COMPLETED', 'ABANDONED') THEN
    RETURN jsonb_build_object('success', false, 'code', 'SUBMISSION_CONFLICT');
  END IF;
  IF COALESCE(v_test.attempt_phase, 'ACTIVE') = 'PAUSED' AND v_test.paused_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_paused', true,
      'attempt_phase', 'PAUSED',
      'paused_at', v_test.paused_at,
      'expires_at', v_test.expires_at,
      'total_paused_ms', COALESCE(v_test.total_paused_ms, 0)
    );
  END IF;
  IF v_test.expires_at IS NOT NULL AND v_test.expires_at < v_now - interval '2 seconds' THEN
    RETURN jsonb_build_object('success', false, 'code', 'ATTEMPT_EXPIRED');
  END IF;

  UPDATE public.mock_tests SET
    attempt_phase = 'PAUSED',
    paused_at = v_now,
    updated_at = v_now
  WHERE id = p_test_id AND user_id = auth.uid();

  RETURN jsonb_build_object(
    'success', true,
    'already_paused', false,
    'attempt_phase', 'PAUSED',
    'paused_at', v_now,
    'expires_at', v_test.expires_at,
    'total_paused_ms', COALESCE(v_test.total_paused_ms, 0),
    'started_at', v_test.started_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_owned_mock_test(p_test_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test public.mock_tests;
  v_now timestamptz := clock_timestamp();
  v_pause_ms bigint := 0;
  v_new_expires timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_test FROM public.mock_tests
   WHERE id = p_test_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;
  IF v_test.status <> 'IN_PROGRESS' OR v_test.started_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'ATTEMPT_NOT_STARTED');
  END IF;
  IF v_test.attempt_phase IN ('SUBMITTING', 'SUBMITTED', 'EVALUATING', 'RESULT_AVAILABLE', 'AUTO_SUBMITTED', 'INVALIDATED')
     OR v_test.status IN ('COMPLETED', 'ABANDONED') THEN
    RETURN jsonb_build_object('success', false, 'code', 'SUBMISSION_CONFLICT');
  END IF;

  IF COALESCE(v_test.attempt_phase, 'ACTIVE') <> 'PAUSED' OR v_test.paused_at IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_active', true,
      'attempt_phase', COALESCE(v_test.attempt_phase, 'ACTIVE'),
      'paused_at', NULL,
      'expires_at', v_test.expires_at,
      'total_paused_ms', COALESCE(v_test.total_paused_ms, 0),
      'started_at', v_test.started_at
    );
  END IF;

  v_pause_ms := GREATEST(0, floor(EXTRACT(EPOCH FROM (v_now - v_test.paused_at)) * 1000)::bigint);
  v_new_expires := CASE
    WHEN v_test.expires_at IS NULL THEN NULL
    ELSE v_test.expires_at + make_interval(secs => (v_pause_ms::numeric / 1000.0))
  END;

  UPDATE public.mock_tests SET
    attempt_phase = 'ACTIVE',
    paused_at = NULL,
    total_paused_ms = COALESCE(total_paused_ms, 0) + v_pause_ms,
    expires_at = v_new_expires,
    updated_at = v_now
  WHERE id = p_test_id AND user_id = auth.uid();

  RETURN jsonb_build_object(
    'success', true,
    'already_active', false,
    'attempt_phase', 'ACTIVE',
    'paused_at', NULL,
    'expires_at', v_new_expires,
    'total_paused_ms', COALESCE(v_test.total_paused_ms, 0) + v_pause_ms,
    'started_at', v_test.started_at,
    'pause_ms_applied', v_pause_ms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pause_owned_mock_test(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resume_owned_mock_test(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pause_owned_mock_test(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resume_owned_mock_test(uuid) TO authenticated, service_role;

COMMIT;
