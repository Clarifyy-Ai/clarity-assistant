-- Guest support chat: allow public-widget threads without an auth user.

ALTER TABLE public.support_threads
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.support_threads
  ADD COLUMN IF NOT EXISTS guest_email TEXT,
  ADD COLUMN IF NOT EXISTS guest_name TEXT,
  ADD COLUMN IF NOT EXISTS guest_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_threads_guest_token
  ON public.support_threads (guest_token)
  WHERE guest_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_threads_guest_email
  ON public.support_threads (guest_email)
  WHERE guest_email IS NOT NULL;

ALTER TABLE public.support_messages
  ALTER COLUMN sender_id DROP NOT NULL;

COMMENT ON COLUMN public.support_threads.guest_token IS
  'Opaque token for anonymous Live Chat widget sessions (localStorage).';
COMMENT ON COLUMN public.support_threads.guest_email IS
  'Contact email for guest Live Chat threads.';
