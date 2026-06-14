
CREATE TABLE IF NOT EXISTS public.scrape_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_type TEXT NOT NULL,
  year_from INTEGER,
  year_to INTEGER,
  status TEXT NOT NULL DEFAULT 'queued',
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scrape_jobs TO authenticated;
GRANT ALL ON public.scrape_jobs TO service_role;
ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage scrape_jobs" ON public.scrape_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_scrape_jobs_updated_at BEFORE UPDATE ON public.scrape_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TABLE IF EXISTS public.scrape_failures CASCADE;
CREATE TABLE public.scrape_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.scrape_jobs(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  status_code INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scrape_failures TO authenticated;
GRANT ALL ON public.scrape_failures TO service_role;
ALTER TABLE public.scrape_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage scrape_failures" ON public.scrape_failures
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.scrape_ingested (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  paper_id UUID REFERENCES public.exam_papers(id) ON DELETE SET NULL,
  job_id UUID REFERENCES public.scrape_jobs(id) ON DELETE SET NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_url, file_hash)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scrape_ingested TO authenticated;
GRANT ALL ON public.scrape_ingested TO service_role;
ALTER TABLE public.scrape_ingested ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage scrape_ingested" ON public.scrape_ingested
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.exam_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID REFERENCES public.exam_papers(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.questions(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  alt_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (storage_path)
);
GRANT SELECT ON public.exam_images TO anon, authenticated;
GRANT ALL ON public.exam_images TO service_role;
ALTER TABLE public.exam_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read exam_images" ON public.exam_images
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins write exam_images" ON public.exam_images
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_exam_images_updated_at BEFORE UPDATE ON public.exam_images
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS questions_examtype_year_idx
  ON public.questions (exam_type, source_year);
