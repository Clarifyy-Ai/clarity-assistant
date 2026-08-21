-- Additive document processing state and history for the personal library.

ALTER TABLE public.personal_library_documents
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS file_category TEXT NOT NULL DEFAULT 'library',
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS processing_error TEXT,
  ADD COLUMN IF NOT EXISTS parsed_content TEXT,
  ADD COLUMN IF NOT EXISTS parsed_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS parser_version TEXT,
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS supersedes_id UUID REFERENCES public.personal_library_documents(id);

CREATE INDEX IF NOT EXISTS idx_personal_library_documents_hash
  ON public.personal_library_documents(owner_id, content_hash)
  WHERE content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_personal_library_documents_status
  ON public.personal_library_documents(owner_id, processing_status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.personal_library_document_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.personal_library_documents(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  parser_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.personal_library_document_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS personal_library_document_attempts_own
  ON public.personal_library_document_attempts;
CREATE POLICY personal_library_document_attempts_own
  ON public.personal_library_document_attempts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.personal_library_documents d
      WHERE d.id = personal_library_document_attempts.document_id
        AND d.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.personal_library_documents d
      WHERE d.id = personal_library_document_attempts.document_id
        AND d.owner_id = auth.uid()
    )
  );
