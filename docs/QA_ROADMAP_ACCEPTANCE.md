# QA Workbook P0 acceptance (engineering close-out)

## Done in this pass

| Item | Evidence |
|------|----------|
| Legacy Answer Bank / Debrief redirects | `App.tsx` → `/app/answers`, `/app/debrief` |
| Document parse idempotency | `x-idempotency-key` from client; content-hash dedupe migration + `parse-resume` |
| Analytics resilience | InlineErrorRetry + stale data; rate-limit fail-open on RPC outage |
| DAY installer dead-end | Primary CTA → `/app/live`; no Retry for unpublished installer |
| Pricing card alignment + elite 20% | `Pricing.tsx`, `subscriptionManager` elite yearly 6320 |
| SEC / fixtures docs | `docs/QA_CREDENTIAL_ROTATION.md`, extended `qa:seed-accounts` |
| Help/legal/share | Status env docs; LegalAuthBackLink; PublicErrorState |

## Ops still required (not code)

1. Run `npm run qa:seed-accounts` and rotate any workbook-exposed passwords.
2. Apply migrations `20260810210000_resume_content_hash.sql` (+ AI Hub if pending).
3. Redeploy Edge: `parse-resume`, `analytics-dashboard`, `prep-tool`, `gap-analysis`, `ai-hub-router`.
4. Set `VITE_STATUS_PAGE_URL` if a real status page exists.

## Verification commands

```bash
npm run test:run -- src/test/lib/network/idempotency.test.ts src/test/lib/auth/sessionRecovery.test.ts
npm run build
```
