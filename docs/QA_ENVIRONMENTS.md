# QA environments & credentials

## Quick setup

```bash
# 1) Seed Free / Pro / Max / Admin users (writes .env.qa.local)
npm run qa:seed-accounts

# 2) Push Stripe/Resend/AI secrets from .env.local → Supabase Edge secrets
#    Requires SUPABASE_ACCESS_TOKEN (dashboard personal access token)
$env:SUPABASE_ACCESS_TOKEN="sbp_..."
npm run qa:sync-secrets
```

Or both: `npm run qa:setup`

## Accounts (after seed)

| Role | Email | Plan | Credits |
|------|-------|------|---------|
| Free | `qa.free@clarify.ai.test` | free | 50 |
| Pro | `qa.pro@clarify.ai.test` | pro | 1400 |
| Max | `qa.max@clarify.ai.test` | enterprise | 4000 |
| Admin | `qa.admin@clarify.ai.test` | enterprise + `user_roles.admin` | 4000 |

Passwords: **only** in `.env.qa.local` (gitignored). Template: `.env.qa.example`.

**Environment gaps (not product bugs):** see [`docs/qa/QA_ENVIRONMENT_GAPS.md`](qa/QA_ENVIRONMENT_GAPS.md).

### Boundary & journey fixtures (after seed)

| Account ID | Email | Env prefix | Notes |
|------------|-------|------------|-------|
| NEW_USER_01 | `qa.onboarding@clarify.ai.test` | `QA_ONBOARDING_*` | Reset with `npm run qa:reset-fixtures` before TC-ONB-001 |
| MFA_USER_01 | `qa.mfa@clarify.ai.test` | `QA_MFA_*` | Run `npm run qa:seed-mfa` for TC-AUTH-015 |
| LOW_CREDIT_01 | `qa.lowcredit@clarify.ai.test` | `QA_LOW_CREDIT_*` | 5 credits |
| EXACT_CREDIT_01 | `qa.exactcredit@clarify.ai.test` | `QA_EXACT_CREDIT_*` | 3 credits (gov paper cost) |
| ZERO_CREDIT_01 | `qa.zero@clarify.ai.test` | `QA_ZERO_CREDIT_*` | 0 credits |

```bash
npm run qa:seed-accounts    # writes .env.qa.local
npm run qa:reset-fixtures   # onboarding + credit boundaries
npm run qa:seed-mfa         # TOTP for qa.mfa@ (optional)
```

## Environments

| Env | Base URL | Supabase |
|-----|----------|----------|
| Local | http://localhost:5173 | `qzgvjrvtkwlzxpmlddkx` |
| Staging / closed beta | https://trycareerpilot.com | same project |
| Prod | https://trycareerpilot.com | same project |

There is no separate staging project yet — treat closed beta as the QA target.

## Secrets checklist (workbook sheet 22)

| Secret | Status |
|--------|--------|
| `GEMINI_API_KEY`, `DEEPGRAM_API_KEY` | Already on Edge (dashboard) |
| `PUBLIC_URL`, `SITE_URL`, `ALLOWED_ORIGINS`, `APP_ENV` | Synced |
| `STRIPE_PRICE_ELITE_*`, credit pack price IDs | Synced from `.env.local` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, other price IDs | **Still placeholders in `.env.local`** — paste real test/live keys, then `npm run qa:sync-secrets` |
| `RESEND_API_KEY` | **Placeholder in `.env.local`** — paste real key to unblock email |
| `RAZORPAY_*` | Not present locally — add then sync |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Not present — calendar stays blocked |
| Code signing cert | CI / desktop release — not Edge |

## Razorpay sandbox checkout

Use **Razorpay India test mode** (test Key ID `rzp_test_…` + matching secret on Edge). Complete checkout with Razorpay dashboard **India test cards / UPI** — never Stripe `4242` cards (those are rejected as international / unsupported).

Create-order fails closed with `503 PAYMENTS_NOT_CONFIGURED` when Razorpay secrets are missing.

## Lovable deploy checklist (closed beta — BUG-LIVE-STAGING-ENV)

Host is Lovable + Cloudflare. We cannot set Lovable's dashboard env vars from
this repo, so every deploy must be checked manually:

1. In the Lovable project dashboard, set (Project Settings → Environment):
   - `VITE_SUPABASE_URL` = `https://qzgvjrvtkwlzxpmlddkx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` and/or `VITE_SUPABASE_PUBLISHABLE_KEY` (Supabase Dashboard → Project Settings → API)
   - `VITE_APP_URL` = `https://trycareerpilot.com`
2. **Trigger a full rebuild** after saving env vars — Lovable/Cloudflare will
   keep serving the old bundle otherwise. Vite inlines `VITE_*` vars at build
   time; changing them without rebuilding does nothing.
3. Verify the shipped bundle actually has the project ref baked in:
   - Open the deployed site → DevTools → Network → find the largest `assets/*.js` file → search its contents for `qzgvjrvtkwlzxpmlddkx`.
   - Or, if you can run the build step yourself: `npm run build:check` (runs `vite build` then `scripts/verify-dist-env.mjs`, which fails the build if the Supabase project hostname isn't present in `dist/assets/*.js`).
4. On the Supabase Edge Functions side, `ALLOWED_ORIGINS` **must include**
   `https://trycareerpilot.com` or every Edge Function call (AI
   hints, debrief, billing, etc.) will fail CORS for this domain.
5. If the app is still stuck on "Loading Career Pilot…": open DevTools console.
   - `Missing required environment variable: VITE_SUPABASE_URL` → step 1/2 above was skipped or the rebuild didn't pick up the new env vars.
   - The boot splash should never hang silently — `src/main.tsx` replaces it with a "Career Pilot failed to start" panel as soon as the app's startup module throws, and `public/boot-watchdog.js` (loaded as an external `/boot-watchdog.js` script, never inline, to satisfy the `script-src 'self'` CSP) is a second-line fallback after 8s if something else goes wrong.
