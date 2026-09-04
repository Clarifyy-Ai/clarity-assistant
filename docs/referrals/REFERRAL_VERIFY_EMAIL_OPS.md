# Referral signup verification email — ops checklist (BUG 22)

Signup confirmation and resend are sent by **Supabase Auth SMTP**, not the product `send-email` / Hostinger Mail REST path. Product mail can work while Auth confirmation mail fails.

## Required configuration

| Item | Expected |
|------|----------|
| Auth custom SMTP host | `smtp.hostinger.com` |
| Port / TLS | `465` (implicit TLS) |
| SMTP user / From | `hello@trycareerpilot.com` |
| SMTP password | Hostinger **mailbox** password (`HOSTINGER_SMTP_PASSWORD`) — **not** `HOSTINGER_MAIL_API_TOKEN` |
| `mailer_autoconfirm` | `false` (do not bypass verification) |
| Site URL | `https://trycareerpilot.com` |
| Redirect allowlist | `/auth/callback`, `/reset-password`, `/login` (absolute URLs under Site URL) |

## Commands (never print secrets)

```bash
# Requires SUPABASE_ACCESS_TOKEN (+ HOSTINGER_SMTP_PASSWORD to apply SMTP)
npm run mail:verify-smtp
npm run mail:configure-hostinger
npm run mail:configure-auth
```

## Smoke test

1. Fresh disposable inbox + `/signup?ref=VALIDCODE`
2. Confirmation email arrives within ~30s (check spam)
3. Resend shows cooldown; rate-limit errors show as rate-limited, not “sent”
4. After verify, referral claim still applies even if `localStorage` was cleared (code is in Auth `user_metadata.pending_referral_code`)

## Remaining blocker (session note)

`npm run mail:verify-smtp` exits with `Set SUPABASE_ACCESS_TOKEN` when the Management API token is unavailable in the agent environment. Ops must run verify/configure with live secrets before declaring live inbox delivery FIXED.
