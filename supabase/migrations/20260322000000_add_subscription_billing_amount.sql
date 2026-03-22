-- Add monthly_amount_cents to subscriptions table so we can display the
-- next invoice amount from persisted Supabase data (set by stripe-webhook).
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS monthly_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS plan_id TEXT,
  ADD COLUMN IF NOT EXISTS monthly_credits INTEGER,
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_product_id TEXT,
  ADD COLUMN IF NOT EXISTS cancel_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;
