BEGIN;

-- Keep moderation state server-controlled. Authors may edit their own text,
-- but only staff may change visibility or locking.
CREATE OR REPLACE FUNCTION public.guard_community_moderation_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_admin()
     AND NOT public.is_moderator()
     AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.locked IS DISTINCT FROM OLD.locked) THEN
    RAISE EXCEPTION 'Only moderators can change moderation state';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_posts_moderation_guard ON public.community_posts;
CREATE TRIGGER community_posts_moderation_guard
  BEFORE UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_community_moderation_fields();

CREATE UNIQUE INDEX IF NOT EXISTS community_reports_one_per_reporter_target
  ON public.community_reports (reporter_id, target_type, target_id);

CREATE OR REPLACE FUNCTION public.validate_learning_course_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_modules integer;
  v_lessons integer;
  v_invalid integer;
BEGIN
  IF NEW.publish_status = 'published' THEN
    SELECT count(*) INTO v_modules FROM public.learning_modules WHERE course_id = NEW.id;
    SELECT count(*) INTO v_lessons
    FROM public.learning_lessons l
    JOIN public.learning_modules m ON m.id = l.module_id
    WHERE m.course_id = NEW.id;
    SELECT count(*) INTO v_invalid
    FROM public.learning_lessons l
    JOIN public.learning_modules m ON m.id = l.module_id
    WHERE m.course_id = NEW.id
      AND (length(btrim(l.title)) = 0
        OR (l.lesson_type = 'text' AND length(btrim(coalesce(l.content_text, ''))) = 0)
        OR (l.lesson_type <> 'text' AND nullif(btrim(coalesce(l.resource_url, '')), '') IS NULL));
    IF v_modules = 0 OR v_lessons = 0 OR v_invalid > 0 THEN
      RAISE EXCEPTION 'Course must contain valid modules and lessons before publishing';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS learning_courses_publish_validation ON public.learning_courses;
CREATE TRIGGER learning_courses_publish_validation
  BEFORE INSERT OR UPDATE OF publish_status ON public.learning_courses
  FOR EACH ROW EXECUTE FUNCTION public.validate_learning_course_publish();

-- Completion is authoritative and idempotent. It also scopes the lesson to a
-- published course and recalculates the enrollment in the same transaction.
CREATE OR REPLACE FUNCTION public.complete_learning_lesson(p_lesson_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_course_id uuid;
  v_total integer;
  v_completed integer;
  v_percentage numeric(5,2);
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT c.id INTO v_course_id
  FROM public.learning_lessons l
  JOIN public.learning_modules m ON m.id = l.module_id
  JOIN public.learning_courses c ON c.id = m.course_id
  WHERE l.id = p_lesson_id AND c.publish_status = 'published';
  IF v_course_id IS NULL THEN RAISE EXCEPTION 'Lesson is not available'; END IF;

  INSERT INTO public.course_enrollments (user_id, course_id, last_accessed)
  VALUES (v_user, v_course_id, now())
  ON CONFLICT (user_id, course_id)
  DO UPDATE SET last_accessed = EXCLUDED.last_accessed;

  INSERT INTO public.lesson_progress (user_id, lesson_id, last_accessed, completed_at)
  VALUES (v_user, p_lesson_id, now(), now())
  ON CONFLICT (user_id, lesson_id)
  DO UPDATE SET last_accessed = EXCLUDED.last_accessed,
                completed_at = COALESCE(public.lesson_progress.completed_at, EXCLUDED.completed_at);

  SELECT count(*) INTO v_total
  FROM public.learning_lessons l
  JOIN public.learning_modules m ON m.id = l.module_id
  WHERE m.course_id = v_course_id;
  SELECT count(*) INTO v_completed
  FROM public.lesson_progress lp
  JOIN public.learning_lessons l ON l.id = lp.lesson_id
  JOIN public.learning_modules m ON m.id = l.module_id
  WHERE lp.user_id = v_user AND m.course_id = v_course_id AND lp.completed_at IS NOT NULL;

  v_percentage := CASE WHEN v_total = 0 THEN 0 ELSE round(100.0 * v_completed / v_total, 2) END;
  UPDATE public.course_enrollments
  SET percentage = v_percentage,
      completed_at = CASE WHEN v_percentage >= 100 THEN COALESCE(completed_at, now()) ELSE NULL END,
      last_accessed = now()
  WHERE user_id = v_user AND course_id = v_course_id;

  RETURN jsonb_build_object('course_id', v_course_id, 'lesson_id', p_lesson_id, 'percentage', v_percentage);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_learning_lesson(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_learning_lesson(uuid) TO authenticated;

COMMIT;
