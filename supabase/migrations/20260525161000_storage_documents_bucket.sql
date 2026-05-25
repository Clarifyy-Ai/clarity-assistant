-- Private bucket for cover letters and other user documents (parse-document edge).
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS documents_own_read ON storage.objects;
DROP POLICY IF EXISTS documents_own_insert ON storage.objects;
DROP POLICY IF EXISTS documents_own_update ON storage.objects;
DROP POLICY IF EXISTS documents_own_delete ON storage.objects;

CREATE POLICY documents_own_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY documents_own_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY documents_own_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY documents_own_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
