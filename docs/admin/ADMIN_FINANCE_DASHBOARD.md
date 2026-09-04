# Admin Finance Dashboard

## Financial architecture

| Domain | Source of truth | Quality |
|--------|-----------------|--------|
| Gross revenue | `payment_orders` (Razorpay paid/fulfilled) | ACTUAL |
| Refunds | `payment_orders.status=refunded` + `credit_transactions.action=refund` | ACTUAL |
| Payment fees | `billing_settings.payment_fee_rate_bps` × gross | ESTIMATED or **COST UNKNOWN** if unset |
| API / AI COGS | `provider_usage` (+ backfill from `ai_usage_logs`) | ESTIMATED (no vendor invoices yet) |
| Credits | `credit_transactions` + `profiles.credits` + open job reserves | ACTUAL counts |
| User price / charge | Edge `resolveActionCost` / `AI_CREDIT_COSTS` | Server authoritative |
| Contribution profit | Gross − Refunds − known Fees − known API/infra | Derived; fixed opex **not configured** |

Edge API: `admin-finance-report` (admin-only via `enforceAdmin`).  
UI: `/app/admin/finance`.

**Never** uses frontend credit maps for finance numbers.

## Provider inventory (discovered)

| Provider | Service | Credential UI | Usage logging |
|----------|---------|---------------|---------------|
| Gemini | AI | Configured/Missing + masked | `logAICost` → `provider_usage` ESTIMATED |
| OpenAI | AI | same | same |
| Anthropic | AI | same | same |
| Deepgram | STT | same | `logDeepgramUsage` ESTIMATED (TTL reserve) |
| Razorpay | Payments | same | Fees via bps config only |
| Resend / Hostinger | Email | same | DATA NOT AVAILABLE |
| OCR.space | OCR | same | DATA NOT AVAILABLE |
| Python hybrid / paper factory | AI | URL present only | DATA NOT AVAILABLE |
| Stripe | Payments | Retired | N/A |

Secrets are never returned — only presence + optional `••••last4`.

## Credit mismatch remediation

| Issue | Status |
|-------|--------|
| Screenshot 10 vs charge 8 | FIXED — `generate-answer` charges `screenshot_answer` when screenshot present |
| Long answer 12 vs 8 | FIXED — long mode uses `resolveActionCost("liveanswerlong")` |
| Gap analysis UI 12 vs 10 | FIXED — `useCredits.gap_analysis` → 10 |
| Scorecard ≡ debrief | FIXED — distinct `generate_scorecard` catalog key |
| Polish 2 vs rephrase 3 | OPEN (info) — keep distinct; do not conflate labels |
| Python / fees / vendor invoices | DATA NOT AVAILABLE / REQUIRES CONFIGURATION |

## Data quality matrix

- ACTUAL: Razorpay orders, credit ledger movements  
- ESTIMATED: AI/Deepgram rate-card costs, optional fee bps  
- UNKNOWN / NOT CONFIGURED: missing fee bps, usage rows without cost, feature revenue attribution  
- DATA NOT AVAILABLE: Python paper factory, OCR, email COGS, vendor invoices  
- Fixed opex: not configured → Contribution Profit only (not Net Profit)

## Tests

```bash
npx vitest run src/test/lib/admin/financeMath.test.ts
npx playwright test e2e/admin-finance.spec.ts
```

## Remaining work

| Item | Status |
|------|--------|
| Unified Finance UI + Edge report | FIXED |
| Schema `provider_unit_costs` / `provider_usage` | FIXED (apply migration) |
| Charge-path catalog mismatches | FIXED (see above) |
| Vendor invoice ingest | REQUIRES CONFIGURATION |
| Python/OCR/email instrumentation | DATA NOT AVAILABLE |
| Actual Razorpay fee lines from settlements | REQUIRES CONFIGURATION |
| Per-user economics drawer (deep) | PARTIALLY FIXED (orders list + aggregate outstanding) |

## Final status

**PARTIALLY FIXED** — MVP contribution P&L from real payments + estimated API usage is live; vendor actuals and unlogged providers remain explicitly labeled, not invented.
