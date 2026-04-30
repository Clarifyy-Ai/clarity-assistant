
REVOKE EXECUTE ON FUNCTION public.get_admin_perf_stats(INTEGER) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_dau_mau(INTEGER) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bulk_update_users(UUID[], JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_perf_stats(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dau_mau(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_users(UUID[], JSONB) TO authenticated;

DROP POLICY IF EXISTS "question_images_public_read" ON storage.objects;
CREATE POLICY "question_images_authed_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'question-images');
CREATE POLICY "question_images_anon_read_by_path" ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'question-images' AND name IS NOT NULL);
