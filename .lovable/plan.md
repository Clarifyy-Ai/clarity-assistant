# Critical Batch — Production Readiness Fixes

Scope: only items #1–#6 from the audit's Critical list. No UI/behavior changes. Working features will not be modified.

Guardrails (per your standing rules):
- Do NOT modify any existing working feature, page, hook, or component.
- Do NOT touch Live/Mock/Prep UI in this pass (those are in the High/spacing batch).
- Each step is independent and reversible.
- All DB changes ship as a single additive migration (no destructive DDL).

---

## Step 1 — Add missing production secrets (requires you)

I cannot create these values; you must paste them via the secure form. The following are missing from the vault and block paid flows / email / AI gap-fill:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY` (or confirm "skip email for now" and I'll feature-flag `send-email`)
- `SYSTEM_USER_ID` (any admin UUID used as author for AI-generated questions)
- `ALLOWED_ORIGINS` (comma list of allowed web origins for edge CORS)

Stripe price IDs are frontend env (`VITE_STRIPE_PRICE_*`) — those go in your `.env`, not the secrets vault.

If you want me to use **Lovable's built-in Stripe payments** instead of BYOK, say the word and I'll route through `enable_stripe_payments` (no key paste needed).

## Step 2 — SECURITY DEFINER hardening migration (single migration)

Single additive migration `20260527140000_definer_grants_and_pg_trgm.sql`:

- `REVOKE EXECUTE ... FROM PUBLIC` on every SECURITY DEFINER function in `public` (deduct_credits, refund_credits, update_topic_performance, bulk_update_users, get_admin_perf_stats, get_admin_dau_mau, mark_notifications_read, add_credits, delete_expired_session_data, increment_profile_credits, is_admin, has_role).
- `GRANT EXECUTE` back to `authenticated` only for the user-facing ones (deduct_credits, refund_credits, mark_notifications_read, update_topic_performance, has_role, is_admin).
- `GRANT EXECUTE` only to `service_role` for admin/system RPCs (bulk_update_users, add_credits, delete_expired_session_data, increment_profile_credits, get_admin_perf_stats, get_admin_dau_mau).
- Add explicit role check at the top of `refund_credits` and `increment_profile_credits` (defense in depth).

## Step 3 — Move `pg_trgm` to `extensions` schema

Same migration:
```
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO authenticated, anon, service_role;
```
Then add `extensions` to the `search_path` of any function that uses trigram operators (none currently do in our SQL — only the operators are used inline, which Postgres resolves via the new schema in `search_path`).

Risk: if any index uses `gin_trgm_ops` it stays valid (operators move with extension). Verified — no app code calls trigram functions by name.

## Step 4 — Edge fleet redeploy

Trigger `supabase--deploy_edge_functions` for all 41 functions in one call so they pick up the latest CORS + model fixes already in the repo.

## Step 5 — Verification

- Run `supabase--linter` after migration — confirm pg_trgm warning gone and no new errors.
- `secrets--fetch_secrets` to confirm new secrets present.
- Spot-check 2 edge functions via logs to confirm redeploy succeeded.

---

## What this plan does NOT touch (intentional)

- Live Co-Pilot, Mock Interview, Mock Session, Overlay UI/spacing
- AdminUsers/AdminRevenue responsive fixes
- Skeleton loaders, N+1, pagination, ts-nocheck sweep
- Badge variant normalization
- Marketing copy, testimonials
- Any working edge function logic
- `src/integrations/supabase/types.ts` (read-only generated file)

These remain queued for the High/Medium batches and will be proposed as separate component-scoped plans per your standing rule.

---

## Order of operations

1. You approve this plan.
2. You paste the 5 secrets (or tell me to skip email / use built-in Stripe).
3. I write + submit the migration (you approve it).
4. I trigger the bulk edge redeploy.
5. I run the linter and report results.

Reply **approve** to proceed, or tell me which steps to drop/modify.
