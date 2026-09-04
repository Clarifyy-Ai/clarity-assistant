# Referral Programme and Reward Contract

## Programme row (`referral_programmes`)

Seeded `referral-v1` from `billing_settings` at migration time.

Fields: version, status (`active`|`disabled`), qualifying_event, referrer/referee credit rewards, discount %, maximum_rewards, terms_url, start/end.

Admin Billing Settings edits the active `referral-v1` row and mirrors amounts into `billing_settings` for one release.

## Claim reward path

1. Insert `referrals` with `programme_id`, `policy_version`, `attribution_source`.
2. Insert `referral_rewards` pending rows with unique idempotency keys:
   - `referral:{attribution_id}:referrer`
   - `referral:{attribution_id}:referee`
3. `add_credits(..., p_payment_id => idempotency_key)` — retries never double-grant.
4. Mark rewards `granted`; set referral `status=rewarded`.
5. Emit `referral_events` `claim_success`.

## Dashboard payload (`get_referral_dashboard`)

```json
{
  "programme": { "...": "amounts + version" },
  "account": { "eligible", "referralCode", "referralLink", "eligibilityReason" },
  "summary": { "attributed", "pending", "qualified", "rewarded", "creditsEarned" },
  "history": [{ "id", "referredEmailMasked", "status", "creditsAwarded", "..." }]
}
```

## Public validate

`POST validate-referral-code` → `{ valid, programmeVersion }` — no PII.

## Historical terms

Already-`rewarded` rows keep original `credits_awarded` / policy_version. Admin amount changes apply to future claims only.
