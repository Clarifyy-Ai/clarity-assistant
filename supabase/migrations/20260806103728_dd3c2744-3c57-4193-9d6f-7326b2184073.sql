
-- documents: already fully covered by authenticated-scoped policies
DROP POLICY IF EXISTS "documents_all" ON storage.objects;
DROP POLICY IF EXISTS "documents_update" ON storage.objects;

-- resumes
DROP POLICY IF EXISTS "resumes_all" ON storage.objects;
DROP POLICY IF EXISTS "resumes_update" ON storage.objects;
CREATE POLICY "resumes_own_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'resumes' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'resumes' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- exports
DROP POLICY IF EXISTS "exports_all" ON storage.objects;
DROP POLICY IF EXISTS "exports_update" ON storage.objects;
CREATE POLICY "exports_own_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'exports' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'exports' AND (auth.uid())::text = (storage.foldername(name))[1]);
