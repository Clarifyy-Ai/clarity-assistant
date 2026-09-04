# Referral Implementation Report

## Delivered

### Phase A

- Referrals page state machine (`loading` | `programme_disabled` | `temporary_backend_failure` | `no_referrals_yet` | `referrals_available` | …)
- Canonical link via `PUBLIC_WEBSITE_URL` / dashboard RPC
- Honest errors + Retry (no silent empty/`25` defaults on the page)
- History status chips + All/Pending/Rewarded/Converted filters
- Login + marketing + onboarding attribution capture; clear storage on logout
- Typed Edge claim responses + correlation id
- Ledger idempotency keys `referral:{id}:referrer|referee`
- `mark_referral_converted` on Razorpay fulfill (no second credit)

### Phase B

- Programme / events / rewards tables
- `get_referral_dashboard` RPC
- Public `validate-referral-code` Edge function

### Phase C

- Admin programme enable + reward sync from Billing Settings
- Unit tests, Playwright referrals e2e, RLS A/B script
- Docs under `docs/referrals/`

## Explicit non-goals (unchanged)

Multi-geo programmes, cookie-authoritative attribution, exposing full referred emails, rewriting historical rewarded amounts.
