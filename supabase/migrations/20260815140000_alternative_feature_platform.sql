-- Alternative feature platform: original question bank, exam templates,
-- learning hub, Q&A, coding assessments, personal library, certificates.
-- Does NOT change AI providers, SSO, or enable copyright scraping / stealth.

-- ── questions: licensing + bank workflow ────────────────────────────────────

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.questions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%question_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;

  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.questions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%source%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%source_year%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%source_paper%'
  LOOP
    EXECUTE format('ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS time_limit_seconds integer,
  ADD COLUMN IF NOT EXISTS license_type text,
  ADD COLUMN IF NOT EXISTS content_owner uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS license_url text,
  ADD COLUMN IF NOT EXISTS copyright_status text,
  ADD COLUMN IF NOT EXISTS publish_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS bank_id uuid;

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_question_type_check;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_question_type_check CHECK (question_type IN (
    'MCQ','MULTIPLE_SELECT','TRUE_FALSE','SHORT_ANSWER','NUMERICAL',
    'SCENARIO','BEHAVIORAL','TECHNICAL','CODING','CASE_STUDY'
  ));

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_source_check;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_source_check CHECK (
    source IS NULL OR source IN (
      'OFFICIAL_PYP','AI_GENERATED','USER_UPLOAD','ORIGINAL','INTERNAL','PUBLIC_DOMAIN'
    )
  );

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_license_type_check;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_license_type_check CHECK (
    license_type IS NULL OR license_type IN (
      'ORIGINAL','USER_OWNED','PUBLIC_DOMAIN','LICENSED','INTERNAL','UNKNOWN'
    )
  );

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_publish_status_check;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_publish_status_check CHECK (
    publish_status IN ('draft','published','archived')
  );

UPDATE public.questions
SET
  license_type = COALESCE(license_type, CASE WHEN uploaded_by IS NOT NULL THEN 'USER_OWNED' ELSE 'UNKNOWN' END),
  content_owner = COALESCE(content_owner, uploaded_by),
  created_by = COALESCE(created_by, uploaded_by),
  copyright_status = COALESCE(copyright_status, COALESCE(license_type, CASE WHEN uploaded_by IS NOT NULL THEN 'USER_OWNED' ELSE 'UNKNOWN' END)),
  category = COALESCE(category, subject),
  publish_status = CASE
    WHEN publish_status IS DISTINCT FROM 'draft' THEN publish_status
    WHEN is_public = true THEN 'published'
    ELSE 'draft'
  END
WHERE true;

CREATE INDEX IF NOT EXISTS questions_license_type_idx ON public.questions (license_type);
CREATE INDEX IF NOT EXISTS questions_publish_status_idx ON public.questions (publish_status);
CREATE INDEX IF NOT EXISTS questions_category_idx ON public.questions (category);
CREATE INDEX IF NOT EXISTS questions_tags_gin ON public.questions USING GIN (tags);

CREATE OR REPLACE FUNCTION public.prevent_unknown_license_publish()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.publish_status = 'published' AND COALESCE(NEW.license_type, 'UNKNOWN') = 'UNKNOWN' THEN
    RAISE EXCEPTION 'UNKNOWN license content cannot be published to public assessments';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS questions_prevent_unknown_publish ON public.questions;
CREATE TRIGGER questions_prevent_unknown_publish
  BEFORE INSERT OR UPDATE ON public.questions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_unknown_license_publish();

DROP VIEW IF EXISTS public.questions_playable;
CREATE VIEW public.questions_playable
WITH (security_invoker = true) AS
SELECT
  id,
  question_text,
  question_html,
  question_type,
  options,
  subject,
  topic,
  subtopic,
  category,
  tags,
  difficulty,
  exam_type,
  marks_positive,
  marks_negative,
  time_limit_seconds,
  has_image,
  image_url,
  latex_present,
  is_verified,
  is_public,
  uploaded_by,
  created_at
FROM public.questions;

GRANT SELECT ON public.questions_playable TO authenticated;

-- ── exam templates ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exam_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  question_count integer NOT NULL CHECK (question_count > 0 AND question_count <= 200),
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 360),
  passing_percentage numeric(5,2) NOT NULL DEFAULT 60,
  marks_positive numeric(6,2) NOT NULL DEFAULT 4,
  marks_negative numeric(6,2) NOT NULL DEFAULT 1,
  randomize boolean NOT NULL DEFAULT true,
  max_attempts integer,
  difficulty_distribution jsonb NOT NULL DEFAULT '{"EASY":30,"MEDIUM":50,"HARD":20}'::jsonb,
  category_distribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_templates_published_idx ON public.exam_templates (is_published);

ALTER TABLE public.exam_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_templates_select ON public.exam_templates;
CREATE POLICY exam_templates_select ON public.exam_templates
  FOR SELECT TO authenticated
  USING (is_published = true OR created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS exam_templates_admin_write ON public.exam_templates;
CREATE POLICY exam_templates_admin_write ON public.exam_templates
  FOR ALL TO authenticated
  USING (public.is_admin() OR created_by = auth.uid())
  WITH CHECK (public.is_admin() OR created_by = auth.uid());

CREATE OR REPLACE FUNCTION public.assemble_assessment_from_template(p_template_id uuid)
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
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_tpl
  FROM public.exam_templates
  WHERE id = p_template_id AND is_published = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  IF v_tpl.max_attempts IS NOT NULL THEN
    SELECT count(*) INTO v_attempts
    FROM public.mock_tests
    WHERE user_id = v_user
      AND config->>'template_id' = p_template_id::text
      AND status IN ('COMPLETED', 'IN_PROGRESS');
    IF v_attempts >= v_tpl.max_attempts THEN
      RAISE EXCEPTION 'Maximum attempts reached for this assessment';
    END IF;
  END IF;

  v_total := v_tpl.question_count;

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
        WHERE q.publish_status = 'published'
          AND COALESCE(q.license_type, 'UNKNOWN') IN ('ORIGINAL','USER_OWNED','PUBLIC_DOMAIN','INTERNAL','LICENSED')
          AND q.difficulty = v_diff
          AND (
            lower(COALESCE(q.category, q.subject, '')) = lower(v_cat)
            OR lower(COALESCE(q.topic, '')) = lower(v_cat)
          )
          AND NOT (q.id = ANY (v_ids))
          AND (q.is_public = true OR q.uploaded_by = v_user OR q.created_by = v_user)
        ORDER BY random()
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
      WHERE q.publish_status = 'published'
        AND COALESCE(q.license_type, 'UNKNOWN') IN ('ORIGINAL','USER_OWNED','PUBLIC_DOMAIN','INTERNAL','LICENSED')
        AND NOT (q.id = ANY (v_ids))
        AND (q.is_public = true OR q.uploaded_by = v_user OR q.created_by = v_user)
      ORDER BY random()
      LIMIT v_fill
    ) x;
    v_ids := v_ids || v_picked;
  END IF;

  SELECT ARRAY(SELECT DISTINCT u FROM unnest(v_ids) AS u) INTO v_ids;

  IF COALESCE(cardinality(v_ids), 0) < 1 THEN
    RAISE EXCEPTION 'Not enough licensed published questions to assemble this assessment';
  END IF;

  INSERT INTO public.mock_tests (
    user_id, test_name, config, question_ids, status, time_limit_minutes
  ) VALUES (
    v_user,
    v_tpl.title,
    jsonb_build_object(
      'template_id', p_template_id,
      'source', 'exam_template',
      'marks_positive', v_tpl.marks_positive,
      'marks_negative', v_tpl.marks_negative,
      'passing_percentage', v_tpl.passing_percentage,
      'randomize_order', v_tpl.randomize
    ),
    v_ids,
    'DRAFT',
    v_tpl.duration_minutes
  )
  RETURNING id INTO v_test_id;

  RETURN jsonb_build_object(
    'test_id', v_test_id,
    'question_count', cardinality(v_ids),
    'duration_minutes', v_tpl.duration_minutes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assemble_assessment_from_template(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assemble_assessment_from_template(uuid) TO authenticated;

-- ── learning hub ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.learning_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  duration_hours numeric(6,2) DEFAULT 0,
  unlock_mode text NOT NULL DEFAULT 'sequential' CHECK (unlock_mode IN ('sequential','open')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  content_owner uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text,
  license_type text NOT NULL DEFAULT 'ORIGINAL'
    CHECK (license_type IN ('ORIGINAL','USER_OWNED','PUBLIC_DOMAIN','LICENSED','INTERNAL','UNKNOWN')),
  license_url text,
  copyright_status text,
  publish_status text NOT NULL DEFAULT 'draft' CHECK (publish_status IN ('draft','published','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.learning_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.learning_courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.learning_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.learning_modules(id) ON DELETE CASCADE,
  title text NOT NULL,
  lesson_type text NOT NULL CHECK (lesson_type IN (
    'video_url','uploaded_video','pdf','ppt','doc','text','external'
  )),
  content_text text,
  resource_url text,
  storage_path text,
  duration_minutes integer,
  sort_order integer NOT NULL DEFAULT 0,
  content_owner uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text,
  license_type text NOT NULL DEFAULT 'ORIGINAL'
    CHECK (license_type IN ('ORIGINAL','USER_OWNED','PUBLIC_DOMAIN','LICENSED','INTERNAL','UNKNOWN')),
  license_url text,
  copyright_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.learning_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.learning_lessons(id) ON DELETE CASCADE,
  title text NOT NULL,
  resource_type text NOT NULL,
  url text,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.learning_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.learning_courses(id) ON DELETE CASCADE,
  module_id uuid REFERENCES public.learning_modules(id) ON DELETE CASCADE,
  title text NOT NULL,
  question_ids uuid[] NOT NULL DEFAULT '{}',
  passing_percentage numeric(5,2) NOT NULL DEFAULT 60,
  is_final boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.course_enrollments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.learning_courses(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_accessed timestamptz,
  completed_at timestamptz,
  percentage numeric(5,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS public.lesson_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.learning_lessons(id) ON DELETE CASCADE,
  last_accessed timestamptz,
  completed_at timestamptz,
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS public.quiz_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL REFERENCES public.learning_quizzes(id) ON DELETE CASCADE,
  score numeric(5,2),
  completed_at timestamptz,
  last_accessed timestamptz,
  PRIMARY KEY (user_id, quiz_id)
);

CREATE TABLE IF NOT EXISTS public.course_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_code text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.learning_courses(id) ON DELETE CASCADE,
  student_name text NOT NULL,
  course_name text NOT NULL,
  course_duration_hours numeric(6,2),
  completion_percentage numeric(5,2) NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS learning_modules_course_idx ON public.learning_modules (course_id, sort_order);
CREATE INDEX IF NOT EXISTS learning_lessons_module_idx ON public.learning_lessons (module_id, sort_order);
CREATE INDEX IF NOT EXISTS course_certificates_code_idx ON public.course_certificates (certificate_code);

ALTER TABLE public.learning_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learning_courses_select ON public.learning_courses;
CREATE POLICY learning_courses_select ON public.learning_courses
  FOR SELECT TO authenticated
  USING (publish_status = 'published' OR created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS learning_courses_write ON public.learning_courses;
CREATE POLICY learning_courses_write ON public.learning_courses
  FOR ALL TO authenticated
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS learning_modules_select ON public.learning_modules;
CREATE POLICY learning_modules_select ON public.learning_modules
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.learning_courses c
      WHERE c.id = course_id
        AND (c.publish_status = 'published' OR c.created_by = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS learning_modules_write ON public.learning_modules;
CREATE POLICY learning_modules_write ON public.learning_modules
  FOR ALL TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.learning_courses c WHERE c.id = course_id AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.learning_courses c WHERE c.id = course_id AND c.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS learning_lessons_select ON public.learning_lessons;
CREATE POLICY learning_lessons_select ON public.learning_lessons
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.learning_modules m
      JOIN public.learning_courses c ON c.id = m.course_id
      WHERE m.id = module_id
        AND (c.publish_status = 'published' OR c.created_by = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS learning_lessons_write ON public.learning_lessons;
CREATE POLICY learning_lessons_write ON public.learning_lessons
  FOR ALL TO authenticated
  USING (
    public.is_admin() OR created_by = auth.uid() OR EXISTS (
      SELECT 1 FROM public.learning_modules m
      JOIN public.learning_courses c ON c.id = m.course_id
      WHERE m.id = module_id AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin() OR created_by = auth.uid() OR EXISTS (
      SELECT 1 FROM public.learning_modules m
      JOIN public.learning_courses c ON c.id = m.course_id
      WHERE m.id = module_id AND c.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS learning_resources_select ON public.learning_resources;
CREATE POLICY learning_resources_select ON public.learning_resources
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.learning_lessons l
      JOIN public.learning_modules m ON m.id = l.module_id
      JOIN public.learning_courses c ON c.id = m.course_id
      WHERE l.id = lesson_id
        AND (c.publish_status = 'published' OR c.created_by = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS learning_resources_write ON public.learning_resources;
CREATE POLICY learning_resources_write ON public.learning_resources
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS learning_quizzes_select ON public.learning_quizzes;
CREATE POLICY learning_quizzes_select ON public.learning_quizzes
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS learning_quizzes_write ON public.learning_quizzes;
CREATE POLICY learning_quizzes_write ON public.learning_quizzes
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS course_enrollments_own ON public.course_enrollments;
CREATE POLICY course_enrollments_own ON public.course_enrollments
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS lesson_progress_own ON public.lesson_progress;
CREATE POLICY lesson_progress_own ON public.lesson_progress
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS quiz_progress_own ON public.quiz_progress;
CREATE POLICY quiz_progress_own ON public.quiz_progress
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS course_certificates_own ON public.course_certificates;
CREATE POLICY course_certificates_own ON public.course_certificates
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS course_certificates_insert ON public.course_certificates;
CREATE POLICY course_certificates_insert ON public.course_certificates
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS course_certificates_no_update ON public.course_certificates;
CREATE POLICY course_certificates_no_update ON public.course_certificates
  FOR UPDATE TO authenticated
  USING (false);

CREATE OR REPLACE FUNCTION public.verify_course_certificate(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.course_certificates%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.course_certificates
  WHERE certificate_code = p_code;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false);
  END IF;
  RETURN jsonb_build_object(
    'valid', true,
    'certificate_code', v_row.certificate_code,
    'student_name', v_row.student_name,
    'course_name', v_row.course_name,
    'issued_at', v_row.issued_at,
    'course_duration_hours', v_row.course_duration_hours,
    'completion_percentage', v_row.completion_percentage,
    'kind', 'Course Completion Certificate'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_course_certificate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_course_certificate(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.issue_course_certificate(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_course public.learning_courses%ROWTYPE;
  v_enroll public.course_enrollments%ROWTYPE;
  v_name text;
  v_code text;
  v_existing public.course_certificates%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_course FROM public.learning_courses WHERE id = p_course_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course not found';
  END IF;

  SELECT * INTO v_enroll
  FROM public.course_enrollments
  WHERE user_id = v_user AND course_id = p_course_id;

  IF NOT FOUND OR COALESCE(v_enroll.percentage, 0) < 100 THEN
    RAISE EXCEPTION 'Course is not complete';
  END IF;

  SELECT * INTO v_existing
  FROM public.course_certificates
  WHERE user_id = v_user AND course_id = p_course_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'certificate_code', v_existing.certificate_code,
      'id', v_existing.id
    );
  END IF;

  SELECT COALESCE(nullif(full_name, ''), split_part(email, '@', 1), 'Learner')
    INTO v_name
  FROM public.profiles
  WHERE id = v_user;

  v_code := 'CLR-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.course_certificates (
    certificate_code, user_id, course_id, student_name, course_name,
    course_duration_hours, completion_percentage, issued_at
  ) VALUES (
    v_code, v_user, p_course_id, COALESCE(v_name, 'Learner'), v_course.title,
    v_course.duration_hours, v_enroll.percentage, now()
  )
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object(
    'certificate_code', v_existing.certificate_code,
    'id', v_existing.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_course_certificate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_course_certificate(uuid) TO authenticated;

-- ── Q&A community ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  category text NOT NULL CHECK (category IN (
    'JavaScript','React','Python','SQL','Interview','HR','Resume','Coding','Aptitude','Career'
  )),
  status text NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN (
    'PENDING','PUBLISHED','HIDDEN','REPORTED','RESOLVED'
  )),
  locked boolean NOT NULL DEFAULT false,
  accepted_answer_id uuid,
  attachment_paths text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_accepted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.community_posts(id) ON DELETE CASCADE,
  answer_id uuid REFERENCES public.community_answers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_votes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('post','answer')),
  target_id uuid NOT NULL,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS public.community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('post','answer','comment')),
  target_id uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_posts_status_idx ON public.community_posts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS community_answers_post_idx ON public.community_answers (post_id);

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_posts_select ON public.community_posts;
CREATE POLICY community_posts_select ON public.community_posts
  FOR SELECT TO authenticated
  USING (status IN ('PUBLISHED','REPORTED','RESOLVED') OR user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS community_posts_insert ON public.community_posts;
CREATE POLICY community_posts_insert ON public.community_posts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS community_posts_update ON public.community_posts;
CREATE POLICY community_posts_update ON public.community_posts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS community_posts_delete ON public.community_posts;
CREATE POLICY community_posts_delete ON public.community_posts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS community_answers_select ON public.community_answers;
CREATE POLICY community_answers_select ON public.community_answers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id
        AND (p.status IN ('PUBLISHED','REPORTED','RESOLVED') OR p.user_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS community_answers_insert ON public.community_answers;
CREATE POLICY community_answers_insert ON public.community_answers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS community_answers_update ON public.community_answers;
CREATE POLICY community_answers_update ON public.community_answers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS community_answers_delete ON public.community_answers;
CREATE POLICY community_answers_delete ON public.community_answers
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS community_comments_select ON public.community_comments;
CREATE POLICY community_comments_select ON public.community_comments
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS community_comments_write ON public.community_comments;
CREATE POLICY community_comments_write ON public.community_comments
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS community_votes_own ON public.community_votes;
CREATE POLICY community_votes_own ON public.community_votes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS community_reports_insert ON public.community_reports;
CREATE POLICY community_reports_insert ON public.community_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS community_reports_select ON public.community_reports;
CREATE POLICY community_reports_select ON public.community_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS community_reports_admin ON public.community_reports;
CREATE POLICY community_reports_admin ON public.community_reports
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── coding assessments ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.coding_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  difficulty text NOT NULL CHECK (difficulty IN ('EASY','MEDIUM','HARD')),
  language text NOT NULL DEFAULT 'javascript',
  starter_code text NOT NULL DEFAULT 'function solve(input) {\n  return input;\n}\n',
  constraints text,
  sample_input text,
  sample_output text,
  time_limit_ms integer NOT NULL DEFAULT 800,
  max_submissions integer NOT NULL DEFAULT 20,
  evaluation_mode text NOT NULL DEFAULT 'javascript_solve'
    CHECK (evaluation_mode IN ('javascript_solve','stored_review')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  content_owner uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text,
  license_type text NOT NULL DEFAULT 'ORIGINAL'
    CHECK (license_type IN ('ORIGINAL','USER_OWNED','PUBLIC_DOMAIN','LICENSED','INTERNAL','UNKNOWN')),
  license_url text,
  copyright_status text,
  publish_status text NOT NULL DEFAULT 'published' CHECK (publish_status IN ('draft','published','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coding_test_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.coding_questions(id) ON DELETE CASCADE,
  name text NOT NULL,
  input_json jsonb,
  expected_json jsonb,
  is_hidden boolean NOT NULL DEFAULT false,
  weight numeric(6,2) NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.coding_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.coding_questions(id) ON DELETE CASCADE,
  code text NOT NULL,
  language text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted','scored','pending_review','rejected','limit_exceeded'
  )),
  score numeric(6,2),
  passed_tests integer,
  failed_tests integer,
  execution_status text,
  result_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS coding_submissions_user_q_idx
  ON public.coding_submissions (user_id, question_id, submitted_at DESC);

ALTER TABLE public.coding_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coding_test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coding_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coding_questions_select ON public.coding_questions;
CREATE POLICY coding_questions_select ON public.coding_questions
  FOR SELECT TO authenticated
  USING (publish_status = 'published' OR created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS coding_questions_write ON public.coding_questions;
CREATE POLICY coding_questions_write ON public.coding_questions
  FOR ALL TO authenticated
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS coding_test_cases_select ON public.coding_test_cases;
CREATE POLICY coding_test_cases_select ON public.coding_test_cases
  FOR SELECT TO authenticated
  USING (
    is_hidden = false
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.coding_questions q
      WHERE q.id = question_id AND q.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS coding_test_cases_write ON public.coding_test_cases;
CREATE POLICY coding_test_cases_write ON public.coding_test_cases
  FOR ALL TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.coding_questions q
      WHERE q.id = question_id AND q.created_by = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.coding_questions q
      WHERE q.id = question_id AND q.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS coding_submissions_select ON public.coding_submissions;
CREATE POLICY coding_submissions_select ON public.coding_submissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS coding_submissions_insert ON public.coding_submissions;
CREATE POLICY coding_submissions_insert ON public.coding_submissions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND score IS NULL);

DROP POLICY IF EXISTS coding_submissions_no_update ON public.coding_submissions;
CREATE POLICY coding_submissions_no_update ON public.coding_submissions
  FOR UPDATE TO authenticated
  USING (false);

CREATE OR REPLACE FUNCTION public.coding_hidden_cases_for_scoring(p_question_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  input_json jsonb,
  expected_json jsonb,
  is_hidden boolean,
  weight numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.input_json, c.expected_json, c.is_hidden, c.weight
  FROM public.coding_test_cases c
  WHERE c.question_id = p_question_id;
$$;

REVOKE ALL ON FUNCTION public.coding_hidden_cases_for_scoring(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coding_hidden_cases_for_scoring(uuid) TO service_role;

-- ── personal document library ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.personal_library_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_name text NOT NULL,
  mime_type text,
  storage_path text,
  source text,
  content_rights text NOT NULL DEFAULT 'USER_OWNED'
    CHECK (content_rights IN ('ORIGINAL','USER_OWNED','PUBLIC_DOMAIN','LICENSED','INTERNAL','UNKNOWN')),
  rights_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.document_practice_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.personal_library_documents(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  question_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.personal_library_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_practice_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS personal_library_own ON public.personal_library_documents;
CREATE POLICY personal_library_own ON public.personal_library_documents
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() AND uploaded_by = auth.uid());

DROP POLICY IF EXISTS document_practice_sets_own ON public.document_practice_sets;
CREATE POLICY document_practice_sets_own ON public.document_practice_sets
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ── transparent practice workspace ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.practice_workspace_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text,
  difficulty text,
  interview_type text NOT NULL CHECK (interview_type IN (
    'Technical','Behavioral','HR','Managerial','System Design','Coding','Resume Based'
  )),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  notes text,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  scores jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.practice_workspace_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS practice_workspace_own ON public.practice_workspace_sessions;
CREATE POLICY practice_workspace_own ON public.practice_workspace_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── updated_at triggers ─────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS exam_templates_updated_at ON public.exam_templates;
CREATE TRIGGER exam_templates_updated_at
  BEFORE UPDATE ON public.exam_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS learning_courses_updated_at ON public.learning_courses;
CREATE TRIGGER learning_courses_updated_at
  BEFORE UPDATE ON public.learning_courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS coding_questions_unknown_publish ON public.coding_questions;
CREATE TRIGGER coding_questions_unknown_publish
  BEFORE INSERT OR UPDATE ON public.coding_questions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_unknown_license_publish();

DROP TRIGGER IF EXISTS learning_courses_unknown_publish ON public.learning_courses;
CREATE TRIGGER learning_courses_unknown_publish
  BEFORE INSERT OR UPDATE ON public.learning_courses
  FOR EACH ROW EXECUTE FUNCTION public.prevent_unknown_license_publish();

-- ── seed original content (not PYQ) ─────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.questions WHERE source_paper = 'clarify_original_seed_v1' LIMIT 1
  ) THEN
    INSERT INTO public.questions (
      question_text, question_type, options, correct_answer, explanation,
      subject, topic, category, difficulty, exam_type, source, source_paper,
      marks_positive, marks_negative, is_public, is_verified,
      license_type, copyright_status, publish_status, tags
    ) VALUES
    ('Which HTML element is the most appropriate landmark for the primary page content?',
      'MCQ',
      '[{"label":"A","text":"<div id=\"content\">"},{"label":"B","text":"<main>"},{"label":"C","text":"<section class=\"primary\">"},{"label":"D","text":"<article id=\"main\">"}]'::jsonb,
      'B', 'The main landmark identifies the primary content of a document.',
      'HTML','Landmarks','HTML','EASY','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['html','a11y']),
    ('What does CSS specificity compare when two rules target the same element?',
      'MCQ',
      '[{"label":"A","text":"Source file size"},{"label":"B","text":"Selector weight (id, class, type)"},{"label":"C","text":"Color contrast ratio"},{"label":"D","text":"Media query count"}]'::jsonb,
      'B', 'Specificity is calculated from ids, classes/attributes, and type selectors.',
      'CSS','Specificity','CSS','MEDIUM','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['css']),
    ('In JavaScript, which method creates a new array without mutating the original?',
      'MCQ',
      '[{"label":"A","text":"array.push(x)"},{"label":"B","text":"array.splice(0,1)"},{"label":"C","text":"array.map(fn)"},{"label":"D","text":"array.sort()"}]'::jsonb,
      'C', 'map returns a new array. push, splice, and sort mutate in place.',
      'JavaScript','Arrays','JavaScript','EASY','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['javascript']),
    ('What is the primary purpose of React keys in a list?',
      'MCQ',
      '[{"label":"A","text":"Styling list items"},{"label":"B","text":"Identifying items across renders"},{"label":"C","text":"Encrypting component props"},{"label":"D","text":"Lazy-loading images"}]'::jsonb,
      'B', 'Keys help React match list items between renders.',
      'React','Lists','React','EASY','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['react']),
    ('Which hook is appropriate for synchronizing a component with an external system?',
      'MCQ',
      '[{"label":"A","text":"useEffect"},{"label":"B","text":"useMemo"},{"label":"C","text":"useId"},{"label":"D","text":"useDeferredValue"}]'::jsonb,
      'A', 'useEffect is the documented hook for external synchronization.',
      'React','Hooks','React','MEDIUM','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['react']),
    ('In Python, what does a list comprehension return?',
      'MCQ',
      '[{"label":"A","text":"A generator object only"},{"label":"B","text":"A new list"},{"label":"C","text":"A tuple"},{"label":"D","text":"None"}]'::jsonb,
      'B', 'List comprehensions eagerly build a new list.',
      'Python','Comprehensions','Python','EASY','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['python']),
    ('Which SQL clause filters groups after aggregation?',
      'MCQ',
      '[{"label":"A","text":"WHERE"},{"label":"B","text":"HAVING"},{"label":"C","text":"FROM"},{"label":"D","text":"JOIN"}]'::jsonb,
      'B', 'HAVING filters aggregated groups; WHERE filters rows before grouping.',
      'SQL','Aggregation','SQL','MEDIUM','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['sql']),
    ('What is the result of INNER JOIN when no keys match?',
      'MCQ',
      '[{"label":"A","text":"All left rows with nulls"},{"label":"B","text":"An empty result set"},{"label":"C","text":"A cartesian product"},{"label":"D","text":"A syntax error"}]'::jsonb,
      'B', 'INNER JOIN keeps only matching rows.',
      'SQL','Joins','SQL','EASY','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['sql']),
    ('If 3 printers print 3 pages in 3 minutes, how long do 6 printers take for 6 pages at the same rate?',
      'MCQ',
      '[{"label":"A","text":"6 minutes"},{"label":"B","text":"3 minutes"},{"label":"C","text":"1 minute"},{"label":"D","text":"9 minutes"}]'::jsonb,
      'B', 'Each printer prints one page every 3 minutes, so 6 printers print 6 pages in 3 minutes.',
      'Aptitude','Rates','Aptitude','MEDIUM','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['aptitude']),
    ('A behavioral interview answer is strongest when it includes which sequence?',
      'MCQ',
      '[{"label":"A","text":"Opinion, slogan, closing"},{"label":"B","text":"Situation, Task, Action, Result"},{"label":"C","text":"Resume recitation only"},{"label":"D","text":"Company history, then hobbies"}]'::jsonb,
      'B', 'STAR gives interviewers a complete, evidence-based story.',
      'HR','Behavioral','HR','EASY','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['hr','interview']),
    ('Which Git command creates a new commit from staged changes?',
      'MCQ',
      '[{"label":"A","text":"git stash"},{"label":"B","text":"git commit"},{"label":"C","text":"git fetch"},{"label":"D","text":"git blame"}]'::jsonb,
      'B', 'git commit records staged snapshots.',
      'DevOps','Git','DevOps','EASY','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['devops']),
    ('In Java, which keyword prevents a class from being subclassed?',
      'MCQ',
      '[{"label":"A","text":"static"},{"label":"B","text":"final"},{"label":"C","text":"volatile"},{"label":"D","text":"transient"}]'::jsonb,
      'B', 'A final class cannot be extended.',
      'Java','Classes','Java','MEDIUM','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['java']),
    ('What does JSON.stringify do with undefined object values?',
      'MCQ',
      '[{"label":"A","text":"Includes them as null"},{"label":"B","text":"Omits those keys"},{"label":"C","text":"Throws"},{"label":"D","text":"Converts them to 0"}]'::jsonb,
      'B', 'undefined values in objects are omitted during JSON serialization.',
      'JavaScript','JSON','JavaScript','HARD','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['javascript']),
    ('Which HTTP status code means the request succeeded and a resource was created?',
      'MCQ',
      '[{"label":"A","text":"200"},{"label":"B","text":"201"},{"label":"C","text":"204"},{"label":"D","text":"304"}]'::jsonb,
      'B', '201 Created is used after successful resource creation.',
      'Backend','HTTP','Backend','EASY','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['backend']),
    ('Which CSS layout is designed for one-dimensional flow?',
      'MCQ',
      '[{"label":"A","text":"Grid"},{"label":"B","text":"Flexbox"},{"label":"C","text":"Position absolute only"},{"label":"D","text":"Table layout"}]'::jsonb,
      'B', 'Flexbox is one-dimensional; Grid is two-dimensional.',
      'CSS','Layout','CSS','EASY','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['css']),
    ('True or false: Python uses indentation to define blocks.',
      'TRUE_FALSE',
      '[{"label":"A","text":"True"},{"label":"B","text":"False"}]'::jsonb,
      'A', 'Indentation is syntactically significant in Python.',
      'Python','Syntax','Python','EASY','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['python']),
    ('Which index type is a common default for equality lookups in PostgreSQL?',
      'MCQ',
      '[{"label":"A","text":"BRIN"},{"label":"B","text":"GIN"},{"label":"C","text":"B-tree"},{"label":"D","text":"GiST"}]'::jsonb,
      'C', 'B-tree is the default PostgreSQL index for equality and range.',
      'SQL','Indexes','SQL','HARD','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['sql']),
    ('A closed question in an HR screen is most useful for which goal?',
      'MCQ',
      '[{"label":"A","text":"Collecting a specific fact"},{"label":"B","text":"Exploring open-ended motivation"},{"label":"C","text":"Replacing a work sample"},{"label":"D","text":"Measuring system design"}]'::jsonb,
      'A', 'Closed questions confirm facts; open questions explore narrative.',
      'HR','Screening','HR','MEDIUM','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['hr']),
    ('Which practice reduces mean time to recover in DevOps?',
      'MCQ',
      '[{"label":"A","text":"Manual-only production changes"},{"label":"B","text":"Automated rollback and observability"},{"label":"C","text":"Disabling logs"},{"label":"D","text":"Skipping post-incident reviews"}]'::jsonb,
      'B', 'Automation and telemetry shorten recovery loops.',
      'DevOps','Reliability','DevOps','MEDIUM','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['devops']),
    ('In JavaScript, promises settle into which states?',
      'MCQ',
      '[{"label":"A","text":"open or closed"},{"label":"B","text":"fulfilled or rejected"},{"label":"C","text":"sync or async only"},{"label":"D","text":"GET or POST"}]'::jsonb,
      'B', 'A promise is fulfilled or rejected after pending.',
      'JavaScript','Async','JavaScript','MEDIUM','CLARIFY_ORIGINAL','ORIGINAL','clarify_original_seed_v1',
      4,1,true,true,'ORIGINAL','ORIGINAL','published', ARRAY['javascript']);
  END IF;
END $$;

INSERT INTO public.exam_templates (
  slug, title, description, question_count, duration_minutes, passing_percentage,
  marks_positive, marks_negative, randomize, max_attempts,
  difficulty_distribution, category_distribution, is_published
)
VALUES
  ('frontend-developer', 'Frontend Developer Assessment',
   'Original Clarify AI template covering HTML, CSS, JavaScript, and React.',
   8, 20, 60, 4, 1, true, 5,
   '{"EASY":30,"MEDIUM":50,"HARD":20}'::jsonb,
   '{"HTML":20,"CSS":20,"JavaScript":30,"React":30}'::jsonb, true),
  ('python-assessment', 'Python Assessment',
   'Original Python fundamentals assessment from the Clarify question bank.',
   6, 15, 60, 4, 1, true, 5,
   '{"EASY":40,"MEDIUM":40,"HARD":20}'::jsonb,
   '{"Python":100}'::jsonb, true),
  ('sql-assessment', 'SQL Assessment',
   'Original SQL assessment generated from the internal question bank.',
   6, 15, 60, 4, 1, true, 5,
   '{"EASY":30,"MEDIUM":50,"HARD":20}'::jsonb,
   '{"SQL":100}'::jsonb, true),
  ('general-aptitude', 'General Aptitude Assessment',
   'Original aptitude items authored by Clarify AI. Not an official exam paper.',
   5, 12, 50, 4, 1, true, 8,
   '{"EASY":40,"MEDIUM":60,"HARD":0}'::jsonb,
   '{"Aptitude":100}'::jsonb, true),
  ('hr-interview', 'HR Interview Assessment',
   'Original HR and behavioral items for interview practice.',
   5, 12, 60, 4, 1, true, 8,
   '{"EASY":50,"MEDIUM":50,"HARD":0}'::jsonb,
   '{"HR":100}'::jsonb, true),
  ('backend-developer', 'Backend Developer Assessment',
   'Original backend and SQL items from the Clarify bank.',
   6, 18, 60, 4, 1, true, 5,
   '{"EASY":30,"MEDIUM":50,"HARD":20}'::jsonb,
   '{"Backend":40,"SQL":40,"Java":20}'::jsonb, true),
  ('devops-assessment', 'DevOps Assessment',
   'Original DevOps practice assessment.',
   5, 12, 60, 4, 1, true, 5,
   '{"EASY":40,"MEDIUM":60,"HARD":0}'::jsonb,
   '{"DevOps":100}'::jsonb, true),
  ('java-developer', 'Java Developer Assessment',
   'Original Java practice assessment from internally authored items.',
   4, 10, 60, 4, 1, true, 5,
   '{"EASY":50,"MEDIUM":50,"HARD":0}'::jsonb,
   '{"Java":100}'::jsonb, true),
  ('react-assessment', 'React Assessment',
   'Original React practice assessment.',
   4, 10, 60, 4, 1, true, 5,
   '{"EASY":50,"MEDIUM":50,"HARD":0}'::jsonb,
   '{"React":100}'::jsonb, true),
  ('data-analyst', 'Data Analyst Assessment',
   'Original SQL and aptitude mix for analyst practice.',
   6, 15, 60, 4, 1, true, 5,
   '{"EASY":40,"MEDIUM":60,"HARD":0}'::jsonb,
   '{"SQL":70,"Aptitude":30}'::jsonb, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.learning_courses (
  slug, title, description, duration_hours, unlock_mode,
  source, license_type, copyright_status, publish_status
)
VALUES (
  'interview-foundations',
  'Clarify Interview Foundations',
  'Original Clarify AI lessons on interview structure, answers, and practice. This is a learning course, not an official certification.',
  2, 'sequential', 'ORIGINAL', 'ORIGINAL', 'ORIGINAL', 'published'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.learning_modules (course_id, title, sort_order)
SELECT c.id, v.title, v.sort_order
FROM public.learning_courses c
CROSS JOIN (VALUES
  ('Prepare your story', 0),
  ('Practice under time', 1)
) AS v(title, sort_order)
WHERE c.slug = 'interview-foundations'
  AND NOT EXISTS (
    SELECT 1 FROM public.learning_modules m WHERE m.course_id = c.id
  );

INSERT INTO public.learning_lessons (
  module_id, title, lesson_type, content_text, duration_minutes, sort_order,
  source, license_type, copyright_status
)
SELECT m.id, v.title, 'text', v.body, v.mins, v.sort_order, 'ORIGINAL', 'ORIGINAL', 'ORIGINAL'
FROM public.learning_modules m
JOIN public.learning_courses c ON c.id = m.course_id
CROSS JOIN LATERAL (
  SELECT * FROM (VALUES
    ('Prepare your story', 'Why interviews are structured',
     'Clarify AI interview practice is visible and intended for preparation. Interviewers typically look for a clear situation, the work you owned, the actions you took, and a measurable result. Write one story for teamwork, one for conflict, and one for a technical decision.',
     12, 0),
    ('Prepare your story', 'Evidence over slogans',
     'Prefer numbers, names of systems, and trade-offs over adjectives. If you cannot share confidential metrics, describe the direction of change and the constraint you optimized.',
     10, 1),
    ('Practice under time', 'Timed answers',
     'Practice answering in 90 seconds. Pause, outline STAR on paper, then speak. This workspace is for rehearsal, not for concealing assistance during a live employer interview.',
     8, 0)
  ) AS x(module_title, title, body, mins, sort_order)
) v
WHERE c.slug = 'interview-foundations'
  AND m.title = v.module_title
  AND NOT EXISTS (
    SELECT 1 FROM public.learning_lessons l WHERE l.module_id = m.id AND l.title = v.title
  );

INSERT INTO public.learning_quizzes (course_id, module_id, title, question_ids, passing_percentage, is_final)
SELECT c.id, m.id, 'Foundations check',
  ARRAY(SELECT q.id FROM public.questions q WHERE q.source_paper = 'clarify_original_seed_v1' LIMIT 4),
  60, true
FROM public.learning_courses c
JOIN public.learning_modules m ON m.course_id = c.id AND m.sort_order = 1
WHERE c.slug = 'interview-foundations'
  AND NOT EXISTS (SELECT 1 FROM public.learning_quizzes qz WHERE qz.course_id = c.id);

INSERT INTO public.coding_questions (
  title, description, difficulty, language, starter_code, constraints,
  sample_input, sample_output, time_limit_ms, max_submissions, evaluation_mode,
  source, license_type, copyright_status, publish_status
)
SELECT
  'Sum the numbers',
  'Write a function solve(input) that receives an array of numbers and returns their sum. Hidden tests are scored on the server and are not shown.',
  'EASY',
  'javascript',
  E'function solve(input) {\n  // input is an array of numbers\n  return 0;\n}\n',
  'Array length <= 100. Values are finite numbers.',
  '[1, 2, 3]',
  '6',
  800,
  10,
  'javascript_solve',
  'ORIGINAL',
  'ORIGINAL',
  'ORIGINAL',
  'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.coding_questions WHERE title = 'Sum the numbers'
);

INSERT INTO public.coding_test_cases (question_id, name, input_json, expected_json, is_hidden, weight, sort_order)
SELECT q.id, v.name, v.input_json, v.expected_json, v.is_hidden, 1, v.sort_order
FROM public.coding_questions q
CROSS JOIN (VALUES
  ('sample-1', '[1, 2, 3]'::jsonb, '6'::jsonb, false, 0),
  ('sample-2', '[]'::jsonb, '0'::jsonb, false, 1),
  ('hidden-1', '[10, -4, 2]'::jsonb, '8'::jsonb, true, 2),
  ('hidden-2', '[100]'::jsonb, '100'::jsonb, true, 3)
) AS v(name, input_json, expected_json, is_hidden, sort_order)
WHERE q.title = 'Sum the numbers'
  AND NOT EXISTS (
    SELECT 1 FROM public.coding_test_cases t WHERE t.question_id = q.id
  );

COMMENT ON TABLE public.exam_templates IS
  'Clarify original assessment blueprints. Not official certification papers.';
COMMENT ON TABLE public.personal_library_documents IS
  'User-owned documents only. Copyrighted exam scraping is not supported.';
COMMENT ON TABLE public.practice_workspace_sessions IS
  'Visible interview practice. Stealth and screen-share evasion are not supported.';
