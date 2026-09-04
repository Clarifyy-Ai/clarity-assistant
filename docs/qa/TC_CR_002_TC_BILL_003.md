# TC-CR-002 / TC-BILL-003 — credits & sandbox billing

Unblocks credit deduction and Razorpay sandbox purchase verification.

## Classification

| Case | If blocked | Typical cause |
|------|------------|---------------|
| **TC-BILL-003** | `CONFIGURATION_BLOCKED` / `RC-RAZORPAY-BILLING` | Edge `razorpay-create-order` → **503** `PAYMENTS_NOT_CONFIGURED` |
| **TC-CR-002** | Config or unclear path | Missing `GEMINI_API_KEY`, or tester used Pro-only AI (gov AI fill / Live overlay) |

Catalog prices on Billing can render even when checkout is misconfigured.

---

## TC-CR-002 — Deduction on AI action (free tier)

**Do not** rely on Pro-only surfaces (`mock_test_ai`, Live overlay, company research).

1. Open `/app/usage` — note **Available credits** (or Billing balance).
2. Use the **Try a credit-consuming AI action** card, or go directly to:
   - `/app/prep` → STAR Builder → fill a section → **Polish** (**2 credits**), or
   - `/app/prep/rephraser` (**3 credits**).
3. Refresh Usage / Billing — balance decreases by the advertised cost.
4. Optional: confirm a debit row in the usage ledger.

Requires Edge `GEMINI_API_KEY` (Admin → Diagnostics / hybrid-health Gemini = configured).

Account: `SUFFICIENT_CREDIT_01` (or any user with enough credits on free/pro).

---

## TC-BILL-003 — Sandbox payment → credit grant

### Edge secrets (project `qzgvjrvtkwlzxpmlddkx`)

| Secret | QA sandbox on `APP_ENV=production` |
|--------|-------------------------------------|
| `RAZORPAY_KEY_ID` | `rzp_test_…` |
| `RAZORPAY_KEY_SECRET` | Matching test secret |
| `RAZORPAY_ALLOW_TEST_KEYS` | `true` |
| `RAZORPAY_WEBHOOK_SECRET` | Recommended (webhook fulfill); **not** required for create-order when test keys + allow flag are set (client `razorpay-verify-payment` path) |
| `PUBLIC_URL` / `SITE_URL` | HTTPS production origin |
| DB `billing_settings.razorpay_enabled` | `true` |

Webhook URL (when secret is set):

`https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1/razorpay-webhook`

Events: `payment.captured`, `payment.failed`.

Sync from local (never commit values):

```bash
npm run qa:sync-secrets
node --use-system-ca scripts/deploy-edge-via-management-api.mjs razorpay-create-order
node --use-system-ca scripts/deploy-edge-via-management-api.mjs razorpay-verify-payment
node --use-system-ca scripts/deploy-edge-via-management-api.mjs razorpay-webhook
node --use-system-ca scripts/_tmp_billing_deploy_verify.mjs
```

### Test steps

1. Note credits on Billing.
2. Buy a credit pack — Razorpay checkout must open (not 503 toast / amber config banner).
3. Complete India **sandbox** UPI/card (not Stripe `4242`).
4. Wait for verify/webhook grant; refresh Billing — balance up + history row.

If checkout still shows the amber **Payments are not configured** banner, treat as ops config — not a card decline.

---

## Related

- [`EXTERNAL_CONFIGURATION_HANDOFF.md`](../../EXTERNAL_CONFIGURATION_HANDOFF.md)
- [`QA_ENVIRONMENT_GAPS.md`](./QA_ENVIRONMENT_GAPS.md) — **QA-GAP-005** / **QA-GAP-006**
