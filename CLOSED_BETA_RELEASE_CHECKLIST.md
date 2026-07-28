# CLOSED_BETA_RELEASE_CHECKLIST.md

## Code

- [x] Builds pass (`npm run build`) — Evidence: PRODUCTION_EVIDENCE.md 2026-07-27 exit 0
- [x] Tests pass (`npm run test:run`) — Evidence: 22 files / 204 tests passed
- [x] Typecheck passes — Evidence: exit 0 (TS5090 fixed)
- [x] Electron build passes (`npm run electron:build`) — Evidence: exit 0
- [x] Release copy gates pass — Evidence: `npm run release:gates` exit 0
- [x] Security gates pass — Evidence: `npm run release:security-gates` exit 0
- [x] Billing catalog parity — Evidence: `npm run billing:parity` exit 0
- [x] AI capability gates — Evidence: `npm run release:capability-gates` (16 functions)
- [ ] Migrations applied remotely (incl. `20260727010000_revoke_deduct_credits_authenticated.sql`)
- [ ] Edge Functions redeployed (billing, AI, rateLimit shared)
- [ ] RLS reverified after latest changes
- [ ] Credits verified on deployed DB (atomic deduct; client RPC blocked)
- [ ] Billing idempotency verified live (Stripe/Razorpay)
- [x] Plan normalization verified (`planCatalog.test.ts`)
- [ ] Admin authorization runtime tests
- [x] Rooms removed from pages (redirects remain) — duplicate top-level route removed
- [x] BYOK remnants removed from authStore (DB null migration pending apply)
- [x] Charging EFs use deductCreditsAtomic + idempotency (local code)
- [x] Razorpay grant-before-paid + catalog credits (local; Vitest 5)
- [x] bulk-import-questions hardened (zod/RL/fail-closed)
- [x] LazyMotion on GovExams + MockTestHub
- [x] CSP script unsafe-inline removed (style retained)

## Operations

- [ ] Production Supabase project confirmed by ops
- [ ] Stripe live key configured
- [ ] Stripe live webhook secret configured
- [ ] Stripe production price IDs configured
- [ ] Razorpay production key configured (if enabled) — currently optional_absent locally
- [ ] Razorpay webhook secret configured (if enabled)
- [ ] Allowed origins / PUBLIC_URL configured
- [ ] Monitoring configured (log drain + alerts)
- [ ] Alerts tested
- [ ] Backup verified
- [ ] Rollback prepared (see RUNBOOK.md)
- [ ] Support channel prepared

## Desktop

- [ ] Windows shortcut smoke test
- [ ] macOS shortcut smoke test
- [ ] Permission prompts verified
- [ ] Shortcut collision behavior verified
- [ ] Exit cleanup verified
- [ ] Signing/notarization checked
- [ ] Auto-update behavior checked

## Product honesty

- [x] Consumer interview-prep positioning
- [x] No HRIS claims
- [x] No org/tenant claims as product surface
- [x] No SSO/SCIM/SAML claims
- [x] No seat-management claims in pricing copy (Max tier)
- [x] Enterprise tier accurately described as Max / high-credit consumer
- [x] Rooms absent from nav / pages
- [x] No false unlimited claims in PricingCard / formatCredits
