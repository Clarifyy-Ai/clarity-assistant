
-- ============ SUPPORT / LIVE CHAT ============
CREATE TABLE IF NOT EXISTS public.support_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subject TEXT NOT NULL DEFAULT 'New conversation',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','snoozed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assigned_admin_id UUID,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_preview TEXT,
  unread_for_admin BOOLEAN NOT NULL DEFAULT true,
  unread_for_user BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_threads_user ON public.support_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_support_threads_status ON public.support_threads(status, last_message_at DESC);

ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_threads_user_select" ON public.support_threads FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "support_threads_user_insert" ON public.support_threads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "support_threads_admin_all" ON public.support_threads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_support_threads_updated
  BEFORE UPDATE ON public.support_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('user','admin','system')),
  body TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_thread ON public.support_messages(thread_id, created_at);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_messages_user_select" ON public.support_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.support_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()));
CREATE POLICY "support_messages_user_insert" ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND sender_role = 'user' AND
    EXISTS (SELECT 1 FROM public.support_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
  );
CREATE POLICY "support_messages_admin_all" ON public.support_messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.support_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;

-- ============ REQUEST METRICS ============
CREATE TABLE IF NOT EXISTS public.request_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_request_metrics_created ON public.request_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_metrics_func ON public.request_metrics(function_name, created_at DESC);

ALTER TABLE public.request_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "request_metrics_admin_select" ON public.request_metrics FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "request_metrics_authed_insert" ON public.request_metrics FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============ QUESTIONS BLOCK SUPPORT ============
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS question_blocks JSONB,
  ADD COLUMN IF NOT EXISTS option_blocks JSONB,
  ADD COLUMN IF NOT EXISTS explanation_blocks JSONB;

-- ============ STORAGE BUCKET FOR QUESTION IMAGES ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "question_images_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'question-images');
CREATE POLICY "question_images_admin_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'question-images' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "question_images_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'question-images' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "question_images_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'question-images' AND public.has_role(auth.uid(),'admin'));

-- ============ ADMIN ANALYTICS RPCs ============
CREATE OR REPLACE FUNCTION public.get_admin_perf_stats(p_days INTEGER DEFAULT 7)
RETURNS TABLE (
  function_name TEXT,
  call_count BIGINT,
  avg_ms NUMERIC,
  p50_ms NUMERIC,
  p95_ms NUMERIC,
  p99_ms NUMERIC,
  error_count BIGINT,
  error_rate NUMERIC
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN QUERY
  SELECT
    rm.function_name,
    COUNT(*)::BIGINT,
    ROUND(AVG(rm.duration_ms)::NUMERIC, 1),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rm.duration_ms)::NUMERIC,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY rm.duration_ms)::NUMERIC,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY rm.duration_ms)::NUMERIC,
    COUNT(*) FILTER (WHERE rm.status_code >= 400)::BIGINT,
    ROUND(100.0 * COUNT(*) FILTER (WHERE rm.status_code >= 400) / GREATEST(COUNT(*),1), 2)
  FROM public.request_metrics rm
  WHERE rm.created_at >= now() - (p_days || ' days')::interval
  GROUP BY rm.function_name
  ORDER BY 2 DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_dau_mau(p_days INTEGER DEFAULT 30)
RETURNS TABLE (day DATE, dau BIGINT)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN QUERY
  SELECT date_trunc('day', s.created_at)::date AS day,
         COUNT(DISTINCT s.user_id)::BIGINT AS dau
  FROM public.sessions s
  WHERE s.created_at >= now() - (p_days || ' days')::interval
  GROUP BY 1 ORDER BY 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_update_users(p_user_ids UUID[], p_patch JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_credits INTEGER;
  v_plan TEXT;
  v_banned BOOLEAN;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  v_credits := (p_patch->>'add_credits')::INTEGER;
  v_plan := p_patch->>'plan_id';
  v_banned := (p_patch->>'is_banned')::BOOLEAN;

  IF v_credits IS NOT NULL THEN
    UPDATE public.profiles SET credits = credits + v_credits, updated_at = now()
    WHERE id = ANY(p_user_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  IF v_plan IS NOT NULL THEN
    UPDATE public.profiles SET plan_id = v_plan::plan_tier, updated_at = now()
    WHERE id = ANY(p_user_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  IF v_banned IS NOT NULL THEN
    UPDATE public.profiles SET is_banned = v_banned, updated_at = now()
    WHERE id = ANY(p_user_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  INSERT INTO public.admin_audit_log(admin_id, action, target_type, new_value)
  VALUES (auth.uid(), 'bulk_update_users', 'profiles',
          jsonb_build_object('user_ids', to_jsonb(p_user_ids), 'patch', p_patch));

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_thread_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_threads
     SET last_message_at = NEW.created_at,
         last_message_preview = LEFT(NEW.body, 140),
         unread_for_admin = CASE WHEN NEW.sender_role='user' THEN true ELSE unread_for_admin END,
         unread_for_user = CASE WHEN NEW.sender_role='admin' THEN true ELSE unread_for_user END,
         updated_at = now()
   WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_support_messages_bump
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_thread_on_message();
