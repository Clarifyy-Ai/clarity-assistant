-- ─────────────────────────────────────────────────────────────────────────────
-- Add is_favourite column to answer_bank for persistent favourite tracking
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.answer_bank
  ADD COLUMN IF NOT EXISTS is_favourite BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS times_used   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
