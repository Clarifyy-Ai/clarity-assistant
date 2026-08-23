-- Assessment taxonomy + start guards.
-- Additive only: eligible_roles / cross_functional / review_status on questions,
-- role_slug / strict_taxonomy / is_active on exam_templates, rewritten assembler.

-- ── 1. Additive taxonomy columns ────────────────────────────────────────────

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS eligible_roles text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS cross_functional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'unreviewed';

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_review_status_check;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_review_status_check
  CHECK (review_status IN ('unreviewed', 'approved', 'rejected'));

ALTER TABLE public.exam_templates
  ADD COLUMN IF NOT EXISTS role_slug text,
  ADD COLUMN IF NOT EXISTS strict_taxonomy boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE public.exam_templates
SET role_slug = slug
WHERE role_slug IS NULL;

ALTER TABLE public.exam_templates
  ALTER COLUMN role_slug SET DEFAULT '',
  ALTER COLUMN role_slug SET NOT NULL;

CREATE INDEX IF NOT EXISTS questions_eligible_roles_gin
  ON public.questions USING GIN (eligible_roles);

CREATE INDEX IF NOT EXISTS questions_assessment_pool_idx
  ON public.questions (publish_status, review_status, difficulty)
  WHERE publish_status = 'published' AND review_status = 'approved';

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, config->>'template_id'
           ORDER BY created_at DESC
         ) AS rn
  FROM public.mock_tests
  WHERE status IN ('DRAFT', 'IN_PROGRESS')
    AND COALESCE(config->>'source', '') = 'exam_template'
)
UPDATE public.mock_tests
SET status = 'ABANDONED'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS mock_tests_one_active_template_attempt
  ON public.mock_tests (user_id, ((config->>'template_id')))
  WHERE status IN ('DRAFT', 'IN_PROGRESS')
    AND COALESCE(config->>'source', '') = 'exam_template';

-- ── 2. Taxonomy helpers ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assessment_default_roles(p_category text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(btrim(COALESCE(p_category, '')))
    WHEN 'html' THEN ARRAY['frontend-developer']
    WHEN 'css' THEN ARRAY['frontend-developer']
    WHEN 'javascript' THEN ARRAY['frontend-developer']
    WHEN 'react' THEN ARRAY['frontend-developer', 'react-assessment']
    WHEN 'backend' THEN ARRAY['backend-developer']
    WHEN 'sql' THEN ARRAY['backend-developer', 'sql-assessment', 'data-analyst']
    WHEN 'java' THEN ARRAY['backend-developer', 'java-developer']
    WHEN 'python' THEN ARRAY['python-assessment']
    WHEN 'devops' THEN ARRAY['devops-assessment']
    WHEN 'aptitude' THEN ARRAY['general-aptitude', 'data-analyst']
    WHEN 'hr' THEN ARRAY['hr-interview']
    ELSE ARRAY[]::text[]
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_frontend_only_category(p_category text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(COALESCE(p_category, ''))) IN ('css', 'html', 'react');
$$;

CREATE OR REPLACE FUNCTION public.assessment_option_labels(p_options jsonb)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_labels text[] := '{}';
  v_item jsonb;
  v_key text;
BEGIN
  IF p_options IS NULL THEN
    RETURN v_labels;
  END IF;
  IF jsonb_typeof(p_options) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_options)
    LOOP
      IF v_item ? 'label' AND btrim(COALESCE(v_item->>'text', '')) <> '' THEN
        v_labels := v_labels || upper(btrim(v_item->>'label'));
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_options) = 'object' THEN
    FOR v_key IN SELECT jsonb_object_keys(p_options)
    LOOP
      IF btrim(COALESCE(p_options->>v_key, '')) <> '' THEN
        v_labels := v_labels || upper(btrim(v_key));
      END IF;
    END LOOP;
  END IF;
  RETURN v_labels;
END;
$$;

CREATE OR REPLACE FUNCTION public.question_is_assessment_ready(q public.questions)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_labels text[];
  v_answer text;
BEGIN
  IF COALESCE(btrim(q.question_text), '') = '' THEN
    RETURN false;
  END IF;
  IF upper(COALESCE(q.difficulty, '')) NOT IN ('EASY', 'MEDIUM', 'HARD') THEN
    RETURN false;
  END IF;
  IF COALESCE(btrim(q.explanation), '') = '' THEN
    RETURN false;
  END IF;
  IF q.publish_status <> 'published' THEN
    RETURN false;
  END IF;
  IF q.review_status <> 'approved' THEN
    RETURN false;
  END IF;
  IF COALESCE(q.license_type, 'UNKNOWN') NOT IN ('ORIGINAL', 'USER_OWNED', 'PUBLIC_DOMAIN', 'INTERNAL', 'LICENSED') THEN
    RETURN false;
  END IF;
  IF COALESCE(q.is_verified, false) IS NOT TRUE THEN
    RETURN false;
  END IF;
  IF upper(COALESCE(q.question_type, 'MCQ')) IN ('MCQ', 'TRUE_FALSE', 'MULTIPLE_SELECT') THEN
    v_labels := public.assessment_option_labels(q.options);
    IF COALESCE(cardinality(v_labels), 0) < 2 THEN
      RETURN false;
    END IF;
    v_answer := upper(btrim(COALESCE(q.correct_answer, '')));
    IF v_answer = '' OR NOT (v_answer = ANY (v_labels)) THEN
      RETURN false;
    END IF;
  ELSIF COALESCE(btrim(q.correct_answer), '') = '' THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.question_matches_template_taxonomy(
  q public.questions,
  p_slug text,
  p_categories text[],
  p_strict boolean
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_roles text[];
  v_cat text;
  v_has_cat boolean := false;
BEGIN
  v_roles := COALESCE(q.eligible_roles, '{}'::text[]);
  IF COALESCE(cardinality(v_roles), 0) = 0 THEN
    v_roles := public.assessment_default_roles(COALESCE(q.category, q.subject));
  END IF;

  IF COALESCE(p_strict, true) AND p_slug = 'backend-developer' THEN
    IF public.is_frontend_only_category(q.category)
       OR public.is_frontend_only_category(q.subject) THEN
      IF COALESCE(q.cross_functional, false) IS NOT TRUE THEN
        RETURN false;
      END IF;
    END IF;
    IF lower(COALESCE(q.topic, '')) IN ('layout', 'specificity')
       AND public.is_frontend_only_category(COALESCE(q.category, q.subject))
       AND COALESCE(q.cross_functional, false) IS NOT TRUE THEN
      RETURN false;
    END IF;
  END IF;

  IF NOT (p_slug = ANY (v_roles)) THEN
    IF COALESCE(q.cross_functional, false) IS NOT TRUE THEN
      RETURN false;
    END IF;
  END IF;

  IF p_categories IS NULL OR cardinality(p_categories) = 0 THEN
    RETURN true;
  END IF;

  FOREACH v_cat IN ARRAY p_categories
  LOOP
    IF lower(COALESCE(q.category, '')) = lower(v_cat)
       OR lower(COALESCE(q.subject, '')) = lower(v_cat)
       OR lower(COALESCE(q.topic, '')) = lower(v_cat) THEN
      v_has_cat := true;
    END IF;
  END LOOP;

  RETURN v_has_cat;
END;
$$;

CREATE OR REPLACE FUNCTION public.raise_assessment_start_error(
  p_code text,
  p_message text,
  p_hint jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '%', p_message
    USING ERRCODE = 'P0001',
          DETAIL = p_code,
          HINT = p_hint::text;
END;
$$;

-- ── 3. Backfill eligibility for existing original bank items ────────────────

UPDATE public.questions q
SET
  eligible_roles = CASE
    WHEN COALESCE(cardinality(q.eligible_roles), 0) > 0 THEN q.eligible_roles
    ELSE public.assessment_default_roles(COALESCE(q.category, q.subject))
  END,
  review_status = CASE
    WHEN q.publish_status = 'published'
         AND COALESCE(q.is_verified, false) = true
         AND COALESCE(q.license_type, 'UNKNOWN') IN ('ORIGINAL', 'USER_OWNED', 'PUBLIC_DOMAIN', 'INTERNAL', 'LICENSED')
      THEN 'approved'
    WHEN q.review_status = 'rejected' THEN 'rejected'
    ELSE q.review_status
  END,
  cross_functional = COALESCE(q.cross_functional, false)
WHERE q.source_paper = 'clarify_original_seed_v1'
   OR COALESCE(q.license_type, 'UNKNOWN') = 'ORIGINAL';

-- CSS / Flexbox-only items stay in the bank but cannot enter backend-only templates.
UPDATE public.questions
SET
  eligible_roles = ARRAY['frontend-developer']::text[],
  cross_functional = false
WHERE publish_status = 'published'
  AND lower(COALESCE(category, subject, '')) = 'css';

UPDATE public.exam_templates
SET
  role_slug = slug,
  strict_taxonomy = true,
  is_active = COALESCE(is_active, true);

-- ── 4. Seed additional original backend-relevant questions ──────────────────

INSERT INTO public.questions (
  question_text, question_type, options, correct_answer, explanation,
  subject, topic, category, difficulty, exam_type, source, source_paper,
  marks_positive, marks_negative, is_public, is_verified,
  license_type, copyright_status, publish_status, tags,
  eligible_roles, cross_functional, review_status
)
SELECT v.question_text, v.question_type, v.options::jsonb, v.correct_answer, v.explanation,
       v.subject, v.topic, v.category, v.difficulty, 'CLARIFY_ORIGINAL', 'ORIGINAL',
       'clarify_original_seed_v2_backend',
       4, 1, true, true, 'ORIGINAL', 'ORIGINAL', 'published', v.tags,
       v.eligible_roles, false, 'approved'
FROM (
  VALUES
    (
      'Which HTTP method is defined as idempotent and is typically used to replace a resource?',
      'MCQ',
      '[{"label":"A","text":"POST"},{"label":"B","text":"PUT"},{"label":"C","text":"PATCH"},{"label":"D","text":"CONNECT"}]',
      'B',
      'PUT replaces a resource and is idempotent; POST is not required to be idempotent.',
      'Backend', 'REST', 'Backend', 'MEDIUM', ARRAY['backend','rest','http']::text[],
      ARRAY['backend-developer']::text[]
    ),
    (
      'Authentication answers which question?',
      'MCQ',
      '[{"label":"A","text":"Who is the caller?"},{"label":"B","text":"What may the caller do?"},{"label":"C","text":"Where is the cache stored?"},{"label":"D","text":"Which queue to publish to?"}]',
      'A',
      'Authentication identifies the caller; authorization decides permitted actions.',
      'Backend', 'Authentication', 'Backend', 'EASY', ARRAY['backend','auth']::text[],
      ARRAY['backend-developer']::text[]
    ),
    (
      'What does the Cache-Control directive no-store instruct caches to do?',
      'MCQ',
      '[{"label":"A","text":"Store the response only in the browser"},{"label":"B","text":"Do not store the response in any cache"},{"label":"C","text":"Store the response forever"},{"label":"D","text":"Convert the response to a 304"}]',
      'B',
      'no-store forbids storing the response in caches.',
      'Backend', 'Caching', 'Backend', 'MEDIUM', ARRAY['backend','caching','http']::text[],
      ARRAY['backend-developer']::text[]
    ),
    (
      'Why are parameterized SQL queries preferred over string-concatenated SQL?',
      'MCQ',
      '[{"label":"A","text":"They make INNER JOIN faster by definition"},{"label":"B","text":"They separate code from data and reduce injection risk"},{"label":"C","text":"They disable indexes"},{"label":"D","text":"They require a table scan on every execution"}]',
      'B',
      'Parameter binding keeps user data out of the SQL parse tree, reducing injection risk.',
      'SQL', 'Security', 'SQL', 'EASY', ARRAY['sql','security']::text[],
      ARRAY['backend-developer','sql-assessment','data-analyst']::text[]
    ),
    (
      'Which HTTP header commonly carries a Bearer access token?',
      'MCQ',
      '[{"label":"A","text":"Accept-Language"},{"label":"B","text":"Authorization"},{"label":"C","text":"Content-Type"},{"label":"D","text":"If-None-Match"}]',
      'B',
      'Authorization: Bearer <token> is the standard header for bearer credentials.',
      'Backend', 'Authorization', 'Backend', 'MEDIUM', ARRAY['backend','auth','http']::text[],
      ARRAY['backend-developer']::text[]
    ),
    (
      'In a message queue, at-least-once delivery means consumers must be prepared to handle which case?',
      'MCQ',
      '[{"label":"A","text":"Messages that never arrive"},{"label":"B","text":"Duplicate deliveries of the same message"},{"label":"C","text":"Only exactly-once side effects without extra design"},{"label":"D","text":"Brokers that delete a message before any consumer sees it"}]',
      'B',
      'At-least-once delivery can redeliver; consumers need idempotent handling.',
      'Backend', 'Queues', 'Backend', 'HARD', ARRAY['backend','queues']::text[],
      ARRAY['backend-developer']::text[]
    )
) AS v(
  question_text, question_type, options, correct_answer, explanation,
  subject, topic, category, difficulty, tags, eligible_roles
)
WHERE NOT EXISTS (
  SELECT 1 FROM public.questions q WHERE q.question_text = v.question_text
);

-- ── 5. Protect taxonomy from non-admin clients ──────────────────────────────

CREATE OR REPLACE FUNCTION public.protect_question_assessment_taxonomy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF current_setting('role', true) IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.eligible_roles := '{}'::text[];
    NEW.cross_functional := false;
    NEW.review_status := 'unreviewed';
    RETURN NEW;
  END IF;
  NEW.eligible_roles := OLD.eligible_roles;
  NEW.cross_functional := OLD.cross_functional;
  NEW.review_status := OLD.review_status;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS questions_protect_assessment_taxonomy ON public.questions;
CREATE TRIGGER questions_protect_assessment_taxonomy
  BEFORE INSERT OR UPDATE ON public.questions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_question_assessment_taxonomy();

-- Templates are platform catalog: only admins write.
DROP POLICY IF EXISTS exam_templates_admin_write ON public.exam_templates;
CREATE POLICY exam_templates_admin_write ON public.exam_templates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 6. Assemble assessment with inventory, taxonomy, idempotency ────────────

DROP FUNCTION IF EXISTS public.assemble_assessment_from_template(uuid);
DROP FUNCTION IF EXISTS public.assemble_assessment_from_template(uuid, text);

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
  v_reused boolean := false;
BEGIN
  IF v_user IS NULL THEN
    PERFORM public.raise_assessment_start_error('UNAUTHORIZED', 'Not authenticated');
  END IF;

  -- Ignore client-supplied role / eligibility. Template is loaded server-side.
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

  -- Resume an in-flight attempt (idempotency / double-click / remount).
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
    RETURN jsonb_build_object(
      'test_id', v_existing_id,
      'question_count', (
        SELECT COALESCE(cardinality(question_ids), 0)
        FROM public.mock_tests
        WHERE id = v_existing_id
      ),
      'duration_minutes', v_tpl.duration_minutes,
      'reused', true,
      'template_slug', v_tpl.slug
    );
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

  v_total := v_tpl.question_count;

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

NOTIFY pgrst, 'reload schema';

COMMENT ON COLUMN public.questions.eligible_roles IS
  'Assessment template slugs this question may appear in. Server-enforced; non-admins cannot change.';
COMMENT ON COLUMN public.questions.cross_functional IS
  'When true, question may appear in templates that explicitly allow overlap. Default false.';
COMMENT ON COLUMN public.questions.review_status IS
  'unreviewed | approved | rejected. Only approved items enter public assessments.';
COMMENT ON FUNCTION public.assemble_assessment_from_template(uuid, text) IS
  'Creates or resumes a mock_tests attempt from an exam template. Filters taxonomy server-side.';
