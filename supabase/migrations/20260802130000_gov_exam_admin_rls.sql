-- Admin content-ops RLS for government exam registry tables.
-- Authenticated admins (is_admin()) may read/write all review states;
-- public catalog policies from 20260802120000 remain for non-admins.

BEGIN;

-- recruiting_bodies
DROP POLICY IF EXISTS gov_recruiting_bodies_admin ON public.recruiting_bodies;
CREATE POLICY gov_recruiting_bodies_admin ON public.recruiting_bodies
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- gov_exams
DROP POLICY IF EXISTS gov_exams_admin ON public.gov_exams;
CREATE POLICY gov_exams_admin ON public.gov_exams
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- gov_exam_aliases
DROP POLICY IF EXISTS gov_exam_aliases_admin ON public.gov_exam_aliases;
CREATE POLICY gov_exam_aliases_admin ON public.gov_exam_aliases
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- gov_exam_stages
DROP POLICY IF EXISTS gov_exam_stages_admin ON public.gov_exam_stages;
CREATE POLICY gov_exam_stages_admin ON public.gov_exam_stages
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- gov_exam_pattern_versions
DROP POLICY IF EXISTS gov_pattern_admin ON public.gov_exam_pattern_versions;
CREATE POLICY gov_pattern_admin ON public.gov_exam_pattern_versions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- gov_exam_sections
DROP POLICY IF EXISTS gov_sections_admin ON public.gov_exam_sections;
CREATE POLICY gov_sections_admin ON public.gov_exam_sections
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- gov_exam_syllabus_versions
DROP POLICY IF EXISTS gov_syllabus_admin ON public.gov_exam_syllabus_versions;
CREATE POLICY gov_syllabus_admin ON public.gov_exam_syllabus_versions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- gov_official_sources
DROP POLICY IF EXISTS gov_sources_admin ON public.gov_official_sources;
CREATE POLICY gov_sources_admin ON public.gov_official_sources
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- paper generation jobs (admin read/update for ops; insert still own-user via existing policy)
DROP POLICY IF EXISTS gov_jobs_admin ON public.gov_paper_generation_jobs;
CREATE POLICY gov_jobs_admin ON public.gov_paper_generation_jobs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- generated papers
DROP POLICY IF EXISTS gov_papers_admin ON public.gov_generated_papers;
CREATE POLICY gov_papers_admin ON public.gov_generated_papers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- paper ↔ question join
DROP POLICY IF EXISTS gov_paper_q_admin ON public.gov_generated_paper_questions;
CREATE POLICY gov_paper_q_admin ON public.gov_generated_paper_questions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;
