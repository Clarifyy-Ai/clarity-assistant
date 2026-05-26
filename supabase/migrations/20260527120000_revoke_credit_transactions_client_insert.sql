-- Revoke client INSERT on credit_transactions.
-- Ledger rows must only be written by service_role (edge functions / SECURITY DEFINER RPCs).
-- The original policy from 20260318032847 allowed any authenticated user to insert arbitrary amounts.
DROP POLICY IF EXISTS "Users can insert own credit transactions" ON public.credit_transactions;
