# RUNBOOK.md — Clarify AI closed beta

## Severity

| Level | Meaning | Owner |
|-------|---------|-------|
| SEV1 | Payments broken / credit double-grant / auth outage | On-call eng |
| SEV2 | AI provider outage / elevated 5xx | On-call eng |
| SEV3 | Degraded UX / non-billing bug | Next business day |

## Billing outage

1. Check Stripe / Razorpay status pages.
2. Run `node scripts/billing-config-preflight.mjs` in the production secret store (never paste secrets into chat).
3. Confirm webhook endpoints return 2xx in provider dashboards.
4. Pause marketing checkout CTAs if checkout create fails >5% for 10 minutes.

## Webhook backlog

1. Inspect Edge Function logs for `stripe-webhook` / `razorpay-webhook`.
2. Duplicate events should return `{ duplicate: true }` — safe.
3. If grants failed and claims released, Stripe will retry — verify single credit_transactions row per payment id.
4. Do **not** manually mark paid without grant.

## Credit mismatch

1. Compare `profiles.credits` vs sum of `credit_transactions`.
2. Use service-role audited adjustment only; never client RPC.
3. Record reason + operator + ticket id.
4. **Privilege check (closed beta):** `authenticated` must NOT have EXECUTE on `public.deduct_credits(text, integer, uuid)` — only `service_role` via `deduct-credits` Edge Function. Verified 2026-08-02 (`auth_can_execute:false`).
5. Live Stripe checkout requires edge secrets `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and catalog price IDs — currently may be absent; do not claim payment GO until preflight + test payment succeed.

## Rate-limit backend outage

- Strict endpoints fail closed with **503** `RATE_LIMIT_BACKEND_UNAVAILABLE`.
- Do not enable in-memory fallback.
- Check `check_rate_limit` RPC health via service-role `ping`.
- Escalate if 503 rate > 2% for 5 minutes at beta scale.

## Supabase outage

1. Status page → communicate temporary unavailability.
2. Do not disable RLS as mitigation.

## AI provider outage

1. Watch generate-* 5xx / timeouts.
2. Optionally force lower-cost model only if product-approved.
3. Refund path: existing refund_credits service-role RPC where applicable.

## Authentication issue

1. Confirm JWT verification still enabled on Edge Functions.
2. Banned-user checks must remain fail-closed.

## Share-token incident

1. Ensure public access uses exact-token RPCs only.
2. Rotate compromised tokens by revoking share rows.

## Electron shortcut failure

1. Follow `docs/ELECTRON_SMOKE_CHECKLIST.md`.
2. Confirm quit unregisters shortcuts.
3. Collision: document conflicting app to user.

## Government paper generation

**Pilot posture: CONDITIONAL_GO_PILOT** — engine/admin/ingest/mastery/validators live; **0** full-sim ready packs; FE host deploy external. Not GO for all exams.

1. Jobs live in `gov_paper_generation_jobs` (durable status + `error_code`).
2. Full-pattern `generated_mock` fails with `INSUFFICIENT_APPROVED_QUESTIONS` when the public bank is short — do not bypass by lowering quality.
3. On failure, credits should refund via `refund_credits` (`refund_*` reasons). Investigate if `credits_charged > 0` and status=`failed` without refund row.
4. Redeploy: `npx supabase@2.111.0 functions deploy create-exam-paper --project-ref <ref> --use-api` (same for `search-exams`, `get-paper-generation-job`, `ingest-source-document`, `extract-question-paper`, `reconcile-paper-quality`, `list-previous-papers`, `recompute-topic-mastery`).
5. Never present generated papers as official/leaked; keep affiliation disclaimer on discovery surfaces.
6. Ops snapshot: `SUPABASE_ACCESS_TOKEN=… node scripts/gov-exam-ops-snapshot.mjs` (exam review_state, jobs 7d, bank readiness, translations, ingest jobs). Details: `docs/GOV_EXAM_MONITORING.md`.
7. Bank readiness: `node scripts/gov-bank-readiness.mjs` — expect partial/empty until packs are certified; do not force full sim.

## Rollback

1. Redeploy previous Edge Function bundle / web build artifact.
2. Do **not** reverse-delete additive migrations; ship compensating migration.
3. Feature-flag checkout off if billing regression.

## Alert thresholds (100–1,000 user beta)

| Signal | Threshold | Severity | First action |
|--------|-----------|----------|--------------|
| Edge 5xx rate | >2% / 5m | SEV2 | Check logs, rollback if deploy-related |
| Webhook failure | >5 fails / 10m | SEV1 | Pause grants investigation |
| Credit deduct fail | >3% / 10m | SEV1 | Freeze AI hot paths if systemic |
| RL backend fail | >2% / 5m | SEV2 | DB health |
| Auth failures | spike 3× baseline | SEV2 | Auth/provider status |
| Unexpected plan_id | any | SEV3 | Catalog audit |

Notification destination: configure in your log drain (PagerDuty/Slack) — **external ops**.
