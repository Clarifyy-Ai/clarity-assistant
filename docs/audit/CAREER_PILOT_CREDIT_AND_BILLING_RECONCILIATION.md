# CAREER_PILOT_CREDIT_AND_BILLING_RECONCILIATION

## Catalog controls

- `credit_catalog_v3`  
- `npm run billing:parity` — packs/ranks  
- `npm run billing:parity-ai` — **new** AI_CREDIT_COSTS FE↔Edge (24 keys) — **passed** this pass  

## Drifts fixed

| Issue | Fix |
|-------|-----|
| PrepLab polish charged as rephraser | Calls `polish-star-section` / `polish_star` |
| Screenshot affordability precheck | Live Copilot uses screenshot cost when capture present |
| Analytics scorecard copy used debrief key | Uses `generate_scorecard` |
| Unknown prep tools default price | Fail-closed before charge |
| Gov terminal fail credit release | All terminals cancel/release |

## Razorpay

- Test-mode code paths present  
- QA docs no longer recommend Stripe `4242` for Razorpay  
- Webhook signature + exactly-once grant: **source contracts** only  
- Live test checkout/webhook: **BLOCKED_BY_CONFIGURATION**  

## Referrals

- No client `creditsDB.add` grant path  
- Edge `record-referral` authoritative  
- Types lag for programme tables  

## Final

Strong repository controls; production reconciliation **not proven** → `IMPLEMENTED_NOT_RUNTIME_VERIFIED`.
