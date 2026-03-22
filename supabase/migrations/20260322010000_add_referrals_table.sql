-- ═══════════════════════════════════════════════════════════════
-- Migration: add_referrals_table
-- Safe to run multiple times (uses IF NOT EXISTS / DROP POLICY IF EXISTS)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.referrals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  credits_awarded INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(referee_id)
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read referrals where they are the referrer or referee
CREATE POLICY IF NOT EXISTS "Users can read own referrals"
  ON public.referrals FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

-- Authenticated users can insert a referral row for themselves as the referee
-- (the referee_id must match their own auth.uid())
CREATE POLICY IF NOT EXISTS "Authenticated users can record own referral"
  ON public.referrals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = referee_id);

-- Allow upsert (update) on conflict (referee_id unique constraint)
CREATE POLICY IF NOT EXISTS "Authenticated users can update own referral row"
  ON public.referrals FOR UPDATE TO authenticated
  USING (auth.uid() = referee_id);
