-- Align Clarify Interview Foundations final assessment with interview content.
-- Previous seed used LIMIT 4 on clarify_original_seed_v1 (frontend tech items),
-- so learners could finish course lessons and still fail a mismatched quiz at ~86%.
-- Also retain best quiz score so a failed retake cannot erase a prior pass.

BEGIN;

-- Prefer existing published HR/interview stems; add missing foundations items only when absent.
ALTER TABLE public.questions DISABLE TRIGGER questions_protect_assessment_taxonomy;
ALTER TABLE public.questions DISABLE TRIGGER questions_validate_publication;

INSERT INTO public.questions (
  question_text, question_type, options, correct_answer, explanation,
  subject, topic, category, difficulty, exam_type, source, source_paper,
  marks_positive, marks_negative, is_public, is_verified,
  license_type, copyright_status, publish_status, tags,
  eligible_roles, cross_functional, review_status, validation_status
)
SELECT
  v.question_text, v.question_type, v.options::jsonb, v.correct_answer, v.explanation,
  v.subject, v.topic, v.category, v.difficulty, 'CLARIFY_ORIGINAL', 'ORIGINAL',
  'clarify_original_seed_v5_interview_foundations',
  4, 0, true, true, 'ORIGINAL', 'ORIGINAL', 'published', v.tags,
  ARRAY['hr-interview']::text[], false, 'approved', 'valid'
FROM (
  VALUES
    (
      'When preparing interview stories, what should you prefer over vague adjectives?',
      'MCQ',
      '[{"label":"A","text":"Slogans and buzzwords"},{"label":"B","text":"Evidence: numbers, systems, and trade-offs"},{"label":"C","text":"Only compliments about the company"},{"label":"D","text":"A long personal biography"}]',
      'B',
      'Evidence beats slogans — metrics, systems, and constraints make answers credible.',
      'HR', 'Evidence', 'HR', 'EASY', ARRAY['hr','interview','foundations']::text[]
    ),
    (
      'What is a practical way to rehearse answers before a live interview?',
      'MCQ',
      '[{"label":"A","text":"Speak for ten minutes without structure"},{"label":"B","text":"Pause, outline STAR, then answer in about 90 seconds"},{"label":"C","text":"Memorize a script word-for-word and never adapt"},{"label":"D","text":"Skip practice and rely on improvisation only"}]',
      'B',
      'Timed STAR practice builds clarity without hiding assistance in a real employer interview.',
      'HR', 'Practice', 'HR', 'EASY', ARRAY['hr','interview','foundations']::text[]
    ),
    (
      'Why do interviewers structure questions around past behavior?',
      'MCQ',
      '[{"label":"A","text":"To make interviews longer"},{"label":"B","text":"Past behavior is a useful signal for how you may work in similar situations"},{"label":"C","text":"To avoid learning about your skills"},{"label":"D","text":"To replace all technical evaluation"}]',
      'B',
      'Structured behavioral questions probe transferable decision-making and ownership.',
      'HR', 'Structure', 'HR', 'EASY', ARRAY['hr','interview','foundations']::text[]
    )
) AS v(
  question_text, question_type, options, correct_answer, explanation,
  subject, topic, category, difficulty, tags
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.questions q
  WHERE q.source_paper = 'clarify_original_seed_v5_interview_foundations'
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1
  FROM public.questions existing
  WHERE existing.exam_type = 'CLARIFY_ORIGINAL'
    AND md5(lower(regexp_replace(trim(v.question_text), '\s+', ' ', 'g')))
      = md5(lower(regexp_replace(trim(existing.question_text), '\s+', ' ', 'g')))
);

ALTER TABLE public.questions ENABLE TRIGGER questions_protect_assessment_taxonomy;
ALTER TABLE public.questions ENABLE TRIGGER questions_validate_publication;

-- Point Foundations final quiz at interview/HR questions (seed v5 + known HR stems).
UPDATE public.learning_quizzes AS quiz
SET question_ids = (
  SELECT COALESCE(array_agg(picked.qid ORDER BY picked.ord, picked.qid), quiz.question_ids)
  FROM (
    SELECT candidates.qid, candidates.ord
    FROM (
      SELECT q.id AS qid, 1 AS ord
      FROM public.questions q
      WHERE q.source_paper = 'clarify_original_seed_v5_interview_foundations'
        AND q.publish_status = 'published'
      UNION ALL
      SELECT q.id AS qid, 2 AS ord
      FROM public.questions q
      WHERE q.publish_status = 'published'
        AND q.category = 'HR'
        AND (
          q.question_text ILIKE '%STAR%'
          OR q.question_text ILIKE '%Situation, Task, Action, Result%'
          OR q.question_text ILIKE '%Tell me about yourself%'
          OR q.question_text ILIKE '%workplace conflict%'
        )
    ) AS candidates
    ORDER BY candidates.ord, candidates.qid
    LIMIT 4
  ) AS picked
)
FROM public.learning_courses AS course
WHERE quiz.course_id = course.id
  AND course.slug = 'interview-foundations'
  AND quiz.is_final IS TRUE;

-- Keep the best score; never clear a prior pass when a later attempt fails.
CREATE OR REPLACE FUNCTION public.record_quiz_progress(
  p_quiz_id uuid,
  p_score numeric,
  p_passed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_course_id uuid;
  v_total_lessons integer;
  v_total_quizzes integer;
  v_total_units integer;
  v_completed_lessons integer;
  v_passed_quizzes integer;
  v_percentage numeric(5,2);
  v_has_final boolean;
  v_final_passed boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT q.course_id INTO v_course_id
  FROM public.learning_quizzes q
  JOIN public.learning_courses c ON c.id = q.course_id
  WHERE q.id = p_quiz_id AND c.publish_status = 'published';
  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'Quiz is not available';
  END IF;

  INSERT INTO public.course_enrollments (user_id, course_id, last_accessed)
  VALUES (v_user, v_course_id, now())
  ON CONFLICT (user_id, course_id)
  DO UPDATE SET last_accessed = EXCLUDED.last_accessed;

  INSERT INTO public.quiz_progress (user_id, quiz_id, score, last_accessed, completed_at)
  VALUES (
    v_user,
    p_quiz_id,
    p_score,
    now(),
    CASE WHEN p_passed THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id, quiz_id)
  DO UPDATE SET
    score = CASE
      WHEN public.quiz_progress.score IS NULL THEN EXCLUDED.score
      WHEN EXCLUDED.score IS NULL THEN public.quiz_progress.score
      ELSE GREATEST(public.quiz_progress.score, EXCLUDED.score)
    END,
    last_accessed = EXCLUDED.last_accessed,
    completed_at = CASE
      WHEN p_passed THEN COALESCE(public.quiz_progress.completed_at, EXCLUDED.completed_at)
      ELSE public.quiz_progress.completed_at
    END;

  SELECT count(*) INTO v_total_lessons
  FROM public.learning_lessons l
  JOIN public.learning_modules m ON m.id = l.module_id
  WHERE m.course_id = v_course_id;

  SELECT count(*) INTO v_total_quizzes
  FROM public.learning_quizzes q
  WHERE q.course_id = v_course_id;

  v_total_units := v_total_lessons + v_total_quizzes;

  SELECT count(*) INTO v_completed_lessons
  FROM public.lesson_progress lp
  JOIN public.learning_lessons l ON l.id = lp.lesson_id
  JOIN public.learning_modules m ON m.id = l.module_id
  WHERE lp.user_id = v_user
    AND m.course_id = v_course_id
    AND lp.completed_at IS NOT NULL;

  SELECT count(*) INTO v_passed_quizzes
  FROM public.quiz_progress qp
  JOIN public.learning_quizzes q ON q.id = qp.quiz_id
  WHERE qp.user_id = v_user
    AND q.course_id = v_course_id
    AND qp.completed_at IS NOT NULL;

  v_percentage := CASE
    WHEN v_total_units = 0 THEN 0
    ELSE round(100.0 * (v_completed_lessons + v_passed_quizzes) / v_total_units, 2)
  END;

  SELECT EXISTS (
    SELECT 1 FROM public.learning_quizzes q
    WHERE q.course_id = v_course_id AND q.is_final = true
  ) INTO v_has_final;

  SELECT EXISTS (
    SELECT 1
    FROM public.quiz_progress qp
    JOIN public.learning_quizzes q ON q.id = qp.quiz_id
    WHERE qp.user_id = v_user
      AND q.course_id = v_course_id
      AND q.is_final = true
      AND qp.completed_at IS NOT NULL
  ) INTO v_final_passed;

  UPDATE public.course_enrollments
  SET percentage = v_percentage,
      completed_at = CASE
        WHEN v_percentage >= 100 AND (NOT v_has_final OR v_final_passed)
          THEN COALESCE(completed_at, now())
        ELSE NULL
      END,
      last_accessed = now()
  WHERE user_id = v_user AND course_id = v_course_id;

  RETURN jsonb_build_object(
    'course_id', v_course_id,
    'quiz_id', p_quiz_id,
    'score', p_score,
    'passed', p_passed,
    'percentage', v_percentage
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_quiz_progress(uuid, numeric, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_quiz_progress(uuid, numeric, boolean) TO authenticated;

COMMIT;
