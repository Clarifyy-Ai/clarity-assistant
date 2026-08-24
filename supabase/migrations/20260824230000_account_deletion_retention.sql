-- Preserve required billing/deletion audit records without retaining a live
-- auth identity. Private application rows remain subject to user cleanup.
BEGIN;

ALTER TABLE public.payment_orders
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.credit_transactions
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.account_deletion_operations
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.account_deletion_operations
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_operations_user_key_uidx
  ON public.account_deletion_operations (user_id, idempotency_key)
  WHERE user_id IS NOT NULL AND idempotency_key IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payment_orders'::regclass
      AND conname = 'payment_orders_user_id_fkey'
  ) THEN
    ALTER TABLE public.payment_orders
      DROP CONSTRAINT payment_orders_user_id_fkey;
    ALTER TABLE public.payment_orders
      ADD CONSTRAINT payment_orders_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.credit_transactions'::regclass
      AND conname = 'credit_transactions_user_id_fkey'
  ) THEN
    ALTER TABLE public.credit_transactions
      DROP CONSTRAINT credit_transactions_user_id_fkey;
    ALTER TABLE public.credit_transactions
      ADD CONSTRAINT credit_transactions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.account_deletion_operations'::regclass
      AND conname = 'account_deletion_operations_user_id_fkey'
  ) THEN
    ALTER TABLE public.account_deletion_operations
      DROP CONSTRAINT account_deletion_operations_user_id_fkey;
    ALTER TABLE public.account_deletion_operations
      ADD CONSTRAINT account_deletion_operations_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
