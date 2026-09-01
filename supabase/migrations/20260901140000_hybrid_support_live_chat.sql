-- Hybrid Live Chat: extend support_threads / support_messages and add
-- assignments, attachments, events, AI operation log, and private storage.

CREATE SEQUENCE IF NOT EXISTS public.support_thread_ref_seq START WITH 10234;

CREATE OR REPLACE FUNCTION public.next_support_public_ref()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'CP-' || nextval('public.support_thread_ref_seq')::text;
$$;

ALTER TABLE public.support_threads
  ADD COLUMN IF NOT EXISTS public_ref text,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS source_path text,
  ADD COLUMN IF NOT EXISTS context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS summary text;

UPDATE public.support_threads
   SET public_ref = 'CP-' || nextval('public.support_thread_ref_seq')::text
 WHERE public_ref IS NULL;

ALTER TABLE public.support_threads
  ALTER COLUMN public_ref SET DEFAULT public.next_support_public_ref();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_threads_public_ref_key'
  ) THEN
    ALTER TABLE public.support_threads ADD CONSTRAINT support_threads_public_ref_key UNIQUE (public_ref);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_threads_category_check'
  ) THEN
    ALTER TABLE public.support_threads ADD CONSTRAINT support_threads_category_check
      CHECK (category IN ('interview','gov_exams','billing','technical','account','general'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_threads_mode_check'
  ) THEN
    ALTER TABLE public.support_threads ADD CONSTRAINT support_threads_mode_check
      CHECK (mode IN ('ai','waiting_agent','agent','resolved'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_support_threads_mode ON public.support_threads(mode, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_threads_assigned ON public.support_threads(assigned_admin_id)
  WHERE assigned_admin_id IS NOT NULL;

ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS sender_type text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS client_message_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS operation_id uuid;

UPDATE public.support_messages
   SET sender_type = CASE sender_role
     WHEN 'admin' THEN 'agent'
     WHEN 'system' THEN 'system'
     ELSE 'user'
   END
 WHERE sender_type = 'user' AND sender_role IN ('admin','system');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_messages_sender_type_check'
  ) THEN
    ALTER TABLE public.support_messages ADD CONSTRAINT support_messages_sender_type_check
      CHECK (sender_type IN ('user','ai','agent','system'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_messages_delivery_status_check'
  ) THEN
    ALTER TABLE public.support_messages ADD CONSTRAINT support_messages_delivery_status_check
      CHECK (delivery_status IN ('sending','sent','delivered','failed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS support_messages_thread_client_id
  ON public.support_messages (thread_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.support_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  assigned_by uuid,
  action text NOT NULL CHECK (action IN ('assign','reassign','unassign')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_assignments_thread ON public.support_assignments(thread_id, created_at DESC);

ALTER TABLE public.support_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_assignments_admin_all ON public.support_assignments;
CREATE POLICY support_assignments_admin_all ON public.support_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.support_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.support_messages(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  content_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  uploaded_by uuid,
  scanned_status text NOT NULL DEFAULT 'pending'
    CHECK (scanned_status IN ('pending','accepted','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_attachments_thread ON public.support_attachments(thread_id);

ALTER TABLE public.support_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_attachments_user_select ON public.support_attachments;
CREATE POLICY support_attachments_user_select ON public.support_attachments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.support_threads t
    WHERE t.id = thread_id AND t.user_id = auth.uid()
  ));
DROP POLICY IF EXISTS support_attachments_admin_all ON public.support_attachments;
CREATE POLICY support_attachments_admin_all ON public.support_attachments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.support_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  actor_id uuid,
  event_type text NOT NULL,
  visibility text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','user')),
  body text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_events_thread ON public.support_events(thread_id, created_at DESC);

ALTER TABLE public.support_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_events_user_select ON public.support_events;
CREATE POLICY support_events_user_select ON public.support_events
  FOR SELECT TO authenticated
  USING (
    visibility = 'user'
    AND EXISTS (
      SELECT 1 FROM public.support_threads t
      WHERE t.id = thread_id AND t.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS support_events_admin_all ON public.support_events;
CREATE POLICY support_events_admin_all ON public.support_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.support_ai_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL UNIQUE,
  thread_id uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  user_id uuid,
  provider text,
  model text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','succeeded','failed')),
  prompt_version text NOT NULL DEFAULT 'support-v1',
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  idempotency_key text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS support_ai_operations_idempotency
  ON public.support_ai_operations (thread_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_ai_operations_thread ON public.support_ai_operations(thread_id, created_at DESC);

ALTER TABLE public.support_ai_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_ai_operations_admin_select ON public.support_ai_operations;
CREATE POLICY support_ai_operations_admin_select ON public.support_ai_operations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-attachments',
  'support-attachments',
  false,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS support_attachments_bucket_admin_all ON storage.objects;
CREATE POLICY support_attachments_bucket_admin_all ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'support-attachments' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'support-attachments' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS support_attachments_bucket_own_read ON storage.objects;
CREATE POLICY support_attachments_bucket_own_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_events;
  END IF;
END $$;
