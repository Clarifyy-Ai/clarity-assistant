-- Add YouTube video lessons to Clarify Interview Foundations course.

INSERT INTO public.learning_modules (course_id, title, sort_order)
SELECT c.id, 'Video lessons', 2
FROM public.learning_courses c
WHERE c.slug = 'interview-foundations'
  AND NOT EXISTS (
    SELECT 1 FROM public.learning_modules m
    WHERE m.course_id = c.id AND m.title = 'Video lessons'
  );

INSERT INTO public.learning_lessons (
  module_id, title, lesson_type, resource_url, duration_minutes, sort_order,
  source, license_type, copyright_status
)
SELECT m.id, v.title, 'video_url', v.url, v.mins, v.sort_order,
  'YOUTUBE', 'LICENSED', 'LICENSED'
FROM public.learning_modules m
JOIN public.learning_courses c ON c.id = m.course_id
CROSS JOIN (VALUES
  ('Tell me about yourself — sample answer', 'https://www.youtube.com/watch?v=05pa1A9j2WI', 6, 0),
  ('STAR method for behavioral questions', 'https://www.youtube.com/watch?v=DHJaHNZBlPw', 4, 1),
  ('Top behavioral interview questions', 'https://www.youtube.com/watch?v=PJKYqLCsaGY', 12, 2)
) AS v(title, url, mins, sort_order)
WHERE c.slug = 'interview-foundations'
  AND m.title = 'Video lessons'
  AND NOT EXISTS (
    SELECT 1 FROM public.learning_lessons l
    WHERE l.module_id = m.id AND l.title = v.title
  );
