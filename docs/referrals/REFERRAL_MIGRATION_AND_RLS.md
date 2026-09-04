# Referral Migration and RLS

## Migration

`supabase/migrations/20260904130000_referral_programme_lifecycle.sql`

Additive only:

- Creates `referral_programmes`, `referral_events`, `referral_rewards`
- Extends `referrals` with programme columns + documents `converted_at`
- Replaces `record_referral_reward` with typed JSON + idempotent ledger keys
- Adds `get_referral_dashboard`, `mark_referral_converted`
- Seeds `referral-v1` from `billing_settings`

Does **not** reassign existing `profiles.referral_code` values.

## RLS summary

| Table | Client |
|-------|--------|
| `referral_programmes` | SELECT active; admin ALL |
| `referrals` | Referrer SELECT (existing); no client INSERT/UPDATE of pin columns |
| `referral_events` | No client policies (service_role only) |
| `referral_rewards` | No client policies (service_role only) |

## RPC grants

- `get_referral_dashboard` → authenticated (SECURITY DEFINER, scoped to `auth.uid()`)
- `record_referral_reward` / `mark_referral_converted` → service_role only

## Spot check

`node scripts/rls-referral-ab-check.mjs` (requires QA_USER_A/B).
