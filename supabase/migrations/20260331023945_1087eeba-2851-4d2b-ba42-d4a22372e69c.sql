
CREATE TABLE public.resume_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id uuid NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  parsed_data jsonb,
  parse_status text NOT NULL DEFAULT 'pending',
  parse_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.resume_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resume_versions_own" ON public.resume_versions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.resumes r
      WHERE r.id = resume_versions.resume_id
      AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.resumes r
      WHERE r.id = resume_versions.resume_id
      AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "resume_versions_service" ON public.resume_versions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
