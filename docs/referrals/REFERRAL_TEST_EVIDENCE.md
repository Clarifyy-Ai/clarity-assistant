# Referral Test Evidence

## Unit

`src/test/lib/referrals.test.ts`

- normalize/store/clear
- `buildReferralLink` → `https://trycareerpilot.com/signup?ref=…`
- terminal clear including `programme_disabled`
- `recordReferral` keeps code on network failure; clears on award

Run: `npx vitest run src/test/lib/referrals.test.ts`

## E2E

`e2e/referrals.spec.ts`

- Marketing `?ref=` → `clarify_ref`
- Dashboard mock: canonical link, copy, history filters
- Backend failure → Retry, not empty “No signups”
- Mobile + desktop responsive smoke

Run: `npx playwright test e2e/referrals.spec.ts`

## RLS A/B

`scripts/rls-referral-ab-check.mjs`

Executed 2026-09-04 against production project `qzgvjrvtkwlzxpmlddkx`: **6/6 passed**

- A dashboard + own referrals
- B cannot read A’s referrals
- Client insert blocked on events/rewards
- A can read active programme

## Manual smoke (post-deploy)

1. User A: `/app/referrals` → stable code after refresh
2. Copy link → `trycareerpilot.com/signup?ref=…`
3. User B signup with that link → claim → A history + credits once
4. Duplicate claim → `already_recorded`, no second credits
5. Self-referral → typed rejection
6. First paid order → `converted_at` set, credits unchanged
