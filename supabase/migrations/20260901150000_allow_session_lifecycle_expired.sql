-- Allow lifecycle_status = EXPIRED.
-- start_owned_session / end_owned_session already write EXPIRED when a leftover
-- open session has passed expires_at. The check from dual-engine certification
-- omitted that value, so session start failed with SESSION_CREATE_FAILED.

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_lifecycle_status_check;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_lifecycle_status_check
  CHECK (
    lifecycle_status IS NULL OR lifecycle_status = ANY (ARRAY[
      'CREATED'::text,
      'DEVICE_CHECK'::text,
      'READY'::text,
      'IN_PROGRESS'::text,
      'PAUSED'::text,
      'COMPLETED'::text,
      'PROCESSING'::text,
      'ANALYZED'::text,
      'CANCELLED'::text,
      'INTERRUPTED'::text,
      'RECOVERABLE_ERROR'::text,
      'FAILED'::text,
      'EXPIRED'::text
    ])
  );
