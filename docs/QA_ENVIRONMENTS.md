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

## Environments

| Env | Base URL | Supabase |
|-----|----------|----------|
| Local | http://localhost:5173 | `qzgvjrvtkwlzxpmlddkx` |
| Staging / closed beta | https://clarify.ai.sltfinanceindia.com | same project |
| Prod | https://clarify.ai.sltfinanceindia.com | same project |

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

## Stripe test card

`4242 4242 4242 4242` — any future expiry, any CVC (test mode only).
