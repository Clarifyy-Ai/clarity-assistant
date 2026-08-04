DROP POLICY IF EXISTS "achievements_read" ON public.achievements;
DROP POLICY IF EXISTS "achievements_read_active" ON public.achievements;
CREATE POLICY "achievements_read_active" ON public.achievements
FOR SELECT TO anon, authenticated
USING (is_active = true);