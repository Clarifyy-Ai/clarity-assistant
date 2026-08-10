DROP POLICY IF EXISTS gov_pattern_select ON public.gov_exam_pattern_versions;
CREATE POLICY gov_pattern_select ON public.gov_exam_pattern_versions
FOR SELECT TO authenticated
USING (
  review_state = 'approved'
  AND EXISTS (
    SELECT 1 FROM public.gov_exams e
    WHERE e.id = gov_exam_pattern_versions.exam_id
      AND e.is_public = true
      AND e.review_state = 'approved'
  )
);

DROP POLICY IF EXISTS gov_syllabus_select ON public.gov_exam_syllabus_versions;
CREATE POLICY gov_syllabus_select ON public.gov_exam_syllabus_versions
FOR SELECT TO authenticated
USING (
  review_state = 'approved'
  AND EXISTS (
    SELECT 1 FROM public.gov_exams e
    WHERE e.id = gov_exam_syllabus_versions.exam_id
      AND e.is_public = true
      AND e.review_state = 'approved'
  )
);

DROP POLICY IF EXISTS gov_sources_select ON public.gov_official_sources;
CREATE POLICY gov_sources_select ON public.gov_official_sources
FOR SELECT TO authenticated
USING (
  review_state = 'approved'
  AND EXISTS (
    SELECT 1 FROM public.gov_exams e
    WHERE e.id = gov_official_sources.exam_id
      AND e.is_public = true
      AND e.review_state = 'approved'
  )
);