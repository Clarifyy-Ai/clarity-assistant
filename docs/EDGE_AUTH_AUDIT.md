# Edge function auth audit (`authenticateRequest`)

**Date:** 2026-05-28  
**Baseline commit:** `b57e7a4`

## Exempt (no JWT / alternate auth)

| Function | Auth mechanism |
|----------|----------------|
| `ping` | Public health check |
| `stripe-webhook` | Stripe signature verification |

## Authenticated — uses `authenticateRequest` or `requireAuth` from `_shared/auth.ts`

All other functions under `supabase/functions/` verify the caller JWT and return **401** on failure.

Functions migrated from inline `getUser` to `authenticateRequest` in this pass:

- `deepgram-token`
- `analytics-dashboard`
- `export-user-data`
- `delete-account`
- `create-test`
- `generate-practice-questions`
- `select-test-questions`
- `disconnect-calendar`

## Checklist

- [x] Every non-exempt function returns 401 without Bearer token
- [x] `verify_jwt = true` in `supabase/config.toml` for authenticated functions
- [x] In-handler auth via `_shared/auth.ts` (defense in depth)
