-- Distributed rate-limit buckets for Edge Functions (service_role only).

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limit_buckets_reset_at_idx
  ON public.rate_limit_buckets (reset_at);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.rate_limit_buckets FROM anon, authenticated;
GRANT ALL ON public.rate_limit_buckets TO service_role;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_ms integer
)
RETURNS TABLE (
  allowed boolean,
  remaining integer,
  reset_at_ms bigint,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window interval := make_interval(secs => GREATEST(p_window_ms, 1) / 1000.0);
  v_count integer;
  v_reset timestamptz;
BEGIN
  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RAISE EXCEPTION 'rate limit key required';
  END IF;
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RAISE EXCEPTION 'rate limit must be positive';
  END IF;
  IF p_window_ms IS NULL OR p_window_ms <= 0 THEN
    RAISE EXCEPTION 'window_ms must be positive';
  END IF;

  SELECT b.count, b.reset_at
    INTO v_count, v_reset
  FROM public.rate_limit_buckets b
  WHERE b.key = p_key
  FOR UPDATE;

  IF NOT FOUND OR v_reset <= v_now THEN
    v_count := 1;
    v_reset := v_now + v_window;
    INSERT INTO public.rate_limit_buckets AS t (key, count, reset_at)
    VALUES (p_key, v_count, v_reset)
    ON CONFLICT (key) DO UPDATE
      SET count = EXCLUDED.count,
          reset_at = EXCLUDED.reset_at;
    allowed := true;
    remaining := GREATEST(p_limit - v_count, 0);
    reset_at_ms := (extract(epoch FROM v_reset) * 1000)::bigint;
    retry_after_seconds := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_count >= p_limit THEN
    allowed := false;
    remaining := 0;
    reset_at_ms := (extract(epoch FROM v_reset) * 1000)::bigint;
    retry_after_seconds := GREATEST(ceil(extract(epoch FROM (v_reset - v_now))), 0)::integer;
    RETURN NEXT;
    RETURN;
  END IF;

  v_count := v_count + 1;
  UPDATE public.rate_limit_buckets
     SET count = v_count
   WHERE key = p_key;

  allowed := true;
  remaining := GREATEST(p_limit - v_count, 0);
  reset_at_ms := (extract(epoch FROM v_reset) * 1000)::bigint;
  retry_after_seconds := 0;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;
