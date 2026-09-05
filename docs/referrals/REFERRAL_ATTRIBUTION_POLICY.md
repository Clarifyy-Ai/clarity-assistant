# Referral Attribution Policy (v1)

## Canonical share link

`https://trycareerpilot.com/signup?ref={CODE}` built from `PUBLIC_WEBSITE_URL`.

## First valid code wins

1. Assistive capture: `localStorage` key `clarify_ref` (temporary only).
2. Pre-verify persistence: at email signup, normalized code is written to Auth `user_metadata.pending_referral_code` (server-side; survives verify and localStorage clear / logout).
3. Authoritative bind: authenticated Edge `record-referral` → `record_referral_reward`, resolving code as explicit → metadata → localStorage.
4. Once a `referrals.referred_id` row exists, further codes are rejected as `already_recorded`.
5. Code is immutable after bind; no client writes to pin columns.

## Qualifying event (v1)

Authenticated claim after referred signup (email verified). Credits grant immediately on successful claim. Verification is never bypassed.

## Conversion

First successful paid Razorpay fulfill sets `converted_at` / status progression via `mark_referral_converted`. **No second credit** under v1.

## Refunds and chargebacks (v1)

Referral signup credits and conversion status are **not reversed** on payment refund or chargeback in v1. Admin review is required for any manual adjustment.

## Rejects (typed reasons)

| Reason | Meaning |
|--------|---------|
| `invalid_code` | Pattern fail |
| `code_not_found` | No matching profile code |
| `self_referral` | Same user as referrer |
| `programme_disabled` | No active programme / max rewards |
| `already_recorded` | Existing attribution |

No email enumeration: `code_not_found` and `invalid_code` map to the same public Edge code `REFERRAL_CODE_INVALID`.

## Storage survival limits

- `clarify_ref` cleared on logout and on terminal claim outcomes.
- `pending_referral_code` in Auth metadata is set at signup; claim prefers it when localStorage is empty.
- Kept on network/temporary failures so ProtectedRoute/onboarding can retry.
- OAuth: code stored before redirect; Auth callback persists storage/URL code to `user_metadata.pending_referral_code` after session is established.

## Auth verification email

Confirmation mail is Supabase Auth SMTP (Hostinger mailbox password), not product `send-email`. See [`REFERRAL_VERIFY_EMAIL_OPS.md`](./REFERRAL_VERIFY_EMAIL_OPS.md).
