-- Extend scorecards with structured details, sharing, and generation timestamp.

ALTER TABLE public.scorecards
  ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS share_token TEXT,
  ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scorecards_share_token
  ON public.scorecards (share_token)
  WHERE share_token IS NOT NULL;

COMMENT ON COLUMN public.scorecards.details IS
  'Extended scorecard payload (question_scores, WPM, filler stats, coach notes).';
COMMENT ON COLUMN public.scorecards.share_token IS
  'Opaque token for public share links; unique when set.';
COMMENT ON COLUMN public.scorecards.is_shared IS
  'Whether the scorecard has been published via share link.';
COMMENT ON COLUMN public.scorecards.generated_at IS
  'When the scorecard was generated (may differ from created_at).';
