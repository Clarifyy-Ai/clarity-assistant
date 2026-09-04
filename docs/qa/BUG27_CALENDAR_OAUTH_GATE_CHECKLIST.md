# BUG 27 — Google Calendar OAuth soft-gate (verification checklist)

Defect: Connect sent general users into Google **Access blocked / 403 access_denied** while OAuth consent is Testing/unverified.

Fix: Edge audience gate + client CTA gate. Manual scheduling unchanged.

## Deploy (required before calling FIXED)

```bash
# Optional: sync new secrets from .env (do not print values)
# GOOGLE_CALENDAR_PUBLIC_OAUTH=false
# GOOGLE_CALENDAR_TEST_USERS=qa1@…,qa2@…
npm run qa:sync-secrets

node --use-system-ca scripts/deploy-edge-fn.mjs sync-calendar
```

**Deployed:** `sync-calendar` **v248** (Management API, project `qzgvjrvtkwlzxpmlddkx`) — audience gate live. Until `GOOGLE_CALENDAR_TEST_USERS` / `GOOGLE_CALENDAR_PUBLIC_OAUTH` are set, probe defaults to `connectAllowed: false` (soft-gate all Connect CTAs; scheduling still works).

Confirm probe for a general Pro session returns `connectAllowed: false`, `reason: "verification_pending"`.
Confirm allowlisted email returns `connectAllowed: true`. Confirm `oauth_start` without allowlist returns **403 `OAUTH_NOT_PUBLIC`** and **no** `authorization_url`.

## Browser verification

| # | Account | Expect |
|---|---------|--------|
| 1 | General Pro (not in Test users / Edge allowlist) | Settings / Interviews / New Interview: Coming soon / verification pending — **no** Google Access blocked interstitial |
| 2 | Edge `GOOGLE_CALENDAR_TEST_USERS` + Google Console Test user | Connect → Connected → Sync (optional) → Disconnect → Reconnect |
| 3 | Allowlisted user who denies consent | `?calendar=denied` amber banner |
| 4 | Any user, calendar disconnected | Schedule interview on `/app/interviews/new` succeeds without Connect |

## Automated coverage

- `npx vitest run src/test/lib/edge/googleCalendarOauthContract.test.ts src/test/lib/interviews/calendarProbeCache.test.ts src/test/pages/settings/calendarOauthDeniedCopy.test.ts`
- `npx playwright test e2e/scheduler-calendar.spec.ts` (verification_pending + denied + schedule paths)

## Ops follow-up (not code)

After Google verification for `calendar.events`: set `GOOGLE_CALENDAR_PUBLIC_OAUTH=true`, redeploy `sync-calendar`, re-check Connect for general Pro users.

See [`GOOGLE_CALENDAR_OAUTH.md`](./GOOGLE_CALENDAR_OAUTH.md) (QA-GAP-007).
