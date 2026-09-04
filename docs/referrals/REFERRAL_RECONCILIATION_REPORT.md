# Referral Reconciliation Report

## Credit ledger alignment

Referral grants use `add_credits` with `stripe_payment_id` = idempotency key:

- `referral:{attribution_id}:referrer`
- `referral:{attribution_id}:referee`

`referral_rewards.credit_transaction_id` points at the matching `credit_transactions` row when granted.

## Dashboard vs ledger

`get_referral_dashboard.summary.creditsEarned` sums `referrals.credits_awarded` for statuses `rewarded`/`converted` for the authenticated referrer. Usage/Billing pages continue to read `credit_transactions` / profile balances — they should match granted referral rows for that user.

## Conversion without double pay

`mark_referral_converted` only sets `converted_at` and may set status `converted` when not already `rewarded`. Event metadata includes `credits_granted: false`.

## Admin changes

Updating programme amounts does not rewrite historical `referrals.credits_awarded` or granted `referral_rewards` rows.

## Ops checklist

1. Apply `20260904130000_referral_programme_lifecycle.sql`
2. Deploy `record-referral`, `validate-referral-code`, and payment fulfill functions that include `razorpayFulfill.ts`
3. Confirm seed programme `referral-v1` is `active`
4. Spot-check one A→B journey and ledger uniqueness on idempotency keys
