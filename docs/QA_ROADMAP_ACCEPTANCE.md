# QA Workbook P0 acceptance (engineering close-out)

## Done in this pass

| Item | Evidence |
|------|----------|
| Legacy Answer Bank / Debrief redirects | `App.tsx` → `/app/answers`, `/app/debrief` |
| `/app/billing` + `/app/subscription` redirects | `App.tsx` → `/app/settings/billing` |
| Document parse idempotency | `x-idempotency-key`; content-hash; prep-tool replay |
| Analytics resilience | InlineErrorRetry + stale data; rate-limit fail-open |
| DAY installer dead-end | Interview Day → `/app/live` primary |
| Pricing true 20% + interval CTAs | `subscriptionManager` PLANS; `Pricing.tsx` |
| OAuth allowlist | `VITE_OAUTH_PROVIDERS` default `google` |
| Email verify before app/onboarding | `emailVerification.ts` + ProtectedRoute |
| Logout returnTo | `assignLoginWithReturnTo` |
| Deletion UX (no CORS copy) | `SettingsDanger` + delete-account CORS |
| SEC / fixtures docs | `QA_CREDENTIAL_ROTATION.md`; seed banned/past_due/disposable |
| Help/legal/share | Status mailto fallback; LegalAuthBackLink; PublicErrorState |

## Ops still required (not code)

1. Run `npm run qa:seed-accounts` and rotate any workbook-exposed passwords (never commit passwords).
2. Supabase Auth: Site URL + redirect allowlist (no localhost in production recovery emails); enable only OAuth providers listed in `VITE_OAUTH_PROVIDERS`.
3. Redeploy Edge: `prep-tool`, `send-email`, `delete-account`, `parse-resume`, `gap-analysis`, `analytics-dashboard`, `submit-test`, `support-chat`.
4. Confirm `RESEND_API_KEY` / `ALLOWED_ORIGINS` secrets.
5. Set `VITE_STATUS_PAGE_URL` if a real status page exists.

## Verification commands

```bash
npm run scan:secrets
npm run test:run -- src/test/lib/network/idempotency.test.ts src/test/lib/auth/sessionRecovery.test.ts src/test/lib/auth/oauthAndPricing.test.ts
npm run build
```
