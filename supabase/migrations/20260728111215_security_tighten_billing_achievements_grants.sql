-- P4 security batch: tighten INSERT on achievement / cost log tables (M8).
-- Safe when tables are absent (baseline recovery may land later in
-- 20260728180000_baseline_recovery_missing_tables.sql).
-- M6: billing_settings SELECT remains open to authenticated — CHANGELOG note.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.user_achievements') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "ua_insert" ON public.user_achievements';
    EXECUTE 'DROP POLICY IF EXISTS ua_insert ON public.user_achievements';
    EXECUTE 'REVOKE INSERT ON public.user_achievements FROM authenticated, anon';
    EXECUTE 'GRANT ALL ON public.user_achievements TO service_role';
  END IF;

  IF to_regclass('public.model_cost_logs') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "model_cost_insert" ON public.model_cost_logs';
    EXECUTE 'DROP POLICY IF EXISTS model_cost_insert ON public.model_cost_logs';
    EXECUTE 'REVOKE INSERT ON public.model_cost_logs FROM authenticated, anon';
    EXECUTE 'GRANT ALL ON public.model_cost_logs TO service_role';
  END IF;
END $$;

COMMIT;
