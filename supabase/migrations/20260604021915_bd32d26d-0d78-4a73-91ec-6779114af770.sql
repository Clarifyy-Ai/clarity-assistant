
-- 1. REFERRALS: hide referred_email from referrers
REVOKE SELECT (referred_email) ON public.referrals FROM authenticated;

CREATE OR REPLACE FUNCTION public.mask_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_email IS NULL OR position('@' in p_email) < 2 THEN NULL
    ELSE left(split_part(p_email, '@', 1), 1)
         || repeat('*', greatest(length(split_part(p_email, '@', 1)) - 1, 1))
         || '@' || split_part(p_email, '@', 2)
  END
$$;

GRANT EXECUTE ON FUNCTION public.mask_email(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_referrals()
RETURNS TABLE(
  id uuid,
  referred_email_masked text,
  referred_id uuid,
  status referral_status,
  credits_awarded integer,
  signed_up_at timestamptz,
  converted_at timestamptz,
  rewarded_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id,
         public.mask_email(r.referred_email),
         r.referred_id,
         r.status,
         r.credits_awarded,
         r.signed_up_at,
         r.converted_at,
         r.rewarded_at,
         r.created_at
  FROM public.referrals r
  WHERE r.referrer_id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.get_my_referrals() TO authenticated;

-- 2. PROFILES REALTIME: remove from publication to stop broadcasting sensitive fields
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles';
  END IF;
END $$;

-- 3. QUESTION-IMAGES storage: restrict object listing to admins; public direct URLs still work
DROP POLICY IF EXISTS "question_images_admin_list" ON storage.objects;
CREATE POLICY "question_images_admin_list"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'question-images' AND public.has_role(auth.uid(), 'admin'));
