# Feature-Level Credit Gating Report

## Final Status

**PARTIALLY FIXED**

- Product rule (app stays usable; only paid actions show Buy Credits / Upgrade): **FIXED** in code
- Catalogue cost mismatches (historical screenshot/long/gap/polish): **FIXED** (`credit_catalog_v3` parity OK)
- Live User A–D browser matrix on production: **DEFERRED** (required for full GO_PRODUCTION)

---

## Current Credit Catalogue

Authoritative: `supabase/functions/_shared/creditEconomics.ts` (`credit_catalog_v3`)  
FE mirror: `src/lib/constants/creditEconomics.ts`  
Parity: `npm run billing:parity-ai` → OK (24 keys)

| Operation key | Cost |
|---------------|------|
| live_hint | 2 |
| live_answer | 8 |
| live_feedback | 3 |
| screenshot_answer | 10 |
| session_debrief | 15 |
| generate_scorecard | 15 |
| ai_coach_message | 2 |
| generate_questions | 12 |
| star_builder | 10 |
| rephraser | 3 |
| company_research | 20 |
| coding_hint | 5 |
| system_design | 8 |
| mock_session | 15 |
| resume_analysis | 12 |
| gap_analysis | 10 |
| parse_document | 8 |
| create_mock_test | 3 |
| mock_test_ai_gap_fill | 15 |
| generate_practice_questions | 15 |
| parse_question_pdf | 20 |
| analyze_test_performance | 12 |
| project_builder | 12 |
| polish_star | 2 |

Derived: `live_answer_long` = live_answer + 4 = **12**

---

## Feature-Level Gating

| Feature | Sufficient | Insufficient / zero |
|---------|------------|---------------------|
| Dashboard / Sessions / Analytics / History / Billing | Open | Open (advisory banner only) |
| Practice Coach / Mock / Live setup wizard | Start works | Wizard stays open; Start shows `InsufficientCreditsAction` |
| Live AI answer / hint / screenshot | Runs | Action-level block + upgrade modal (`useLiveCopilot`) |
| Gov Exam hub / results | Open | Open; only Generate Paper / topic practice gated |
| Scorecard generate | Runs | `INSUFFICIENT_CREDITS` + Buy Credits panel (not “no sessions”) |
| Debrief generate | Runs | Inline Buy Credits panel |
| Company Research (Pro) | Generate brief | Generate area Buy Credits; page stays open |
| Prep STAR / Rephraser / etc. | Tool action | Action disabled / Buy Credits in tool |
| Documents gap analysis | Runs | Preflight + Buy Credits; page stays open |
| Coding Lab | Local run free | AI coding hint gated; lab open |
| Assessments list / completed | Open | Inventory/plan codes separate; no global credit block |

---

## Plan Gating

Upgrade shown when:

- `CAPABILITY_REQUIRED` / `PLAN_UPGRADE_REQUIRED` / `FEATURE_NOT_AVAILABLE_FOR_PLAN`
- Company Research free tier via `PlanGate` (plan ≠ credits)
- Scorecard / features with `mode="plan"` on `InsufficientCreditsAction`

**Not** shown merely because balance is 0 on a plan-allowed feature (Buy Credits instead).

---

## Buy Credits

Shown on (non-exhaustive): session Start, Scorecard, Debrief, Company brief, STAR rewrite, gap analysis, Gov generate (existing), Prep tools with `canAfford`, Live AI ops via upgrade modal + action messaging.

Navigates to `/app/settings/billing?returnTo=…` — **no auto-redirect**.

---

## Free Operations (remain at 0 credits)

View/navigate: Dashboard, Documents library, Session History, Analytics, Results, Settings, Billing, Gov exam browse, Assessments browse, Coding lab open, viewing existing scorecards/debriefs/briefs, overlay open / mic UI (no per-packet charge).

---

## Server Enforcement

- Costs from `resolveActionCost` / `creditCost()` — client `cost` ignored on `deduct-credits`
- Hybrid / job paths reserve before AI; fail → refund/release
- Unknown hybrid op → `UNKNOWN_OPERATION`, no charge
- Direct API bypass still hits Edge deduct/reserve

---

## Reservation

Gov paper / company research / debrief: reserve on accept → finalize on success → release on failure. Client preflight prevents job create when known-insufficient.

---

## Known Cost Mismatches

| Item | Status |
|------|--------|
| Screenshot 10 vs 8 | FIXED (both 10) |
| Long answer 12 vs 8 | FIXED (12 via premium) |
| Gap 12 vs 10 | FIXED (10) |
| PrepLab polish 2 vs 3 | FIXED (polish_star = 2) |
| Legacy `types.ts` CREDIT_COSTS partial map | Soft drift — unused by primary Edge paths |
| `prep_tool_raw_prompt` → live_hint vs rephraser TOOL_COSTS | Soft drift — document only |

---

## Files Changed (primary)

- `src/lib/billing/actionCreditGate.ts` (new)
- `src/components/billing/InsufficientCreditsAction.tsx` (new)
- `src/lib/billing/creditErrorCodes.ts`
- `src/lib/network/aiErrorUx.ts`
- `src/components/session/PreSessionSetupWizard.tsx`
- `src/hooks/useScorecard.ts`, `src/pages/Scorecard.tsx`
- `src/lib/scorecard/eligibility.ts`, `supabase/functions/_shared/scorecardEligibility.ts`
- `src/pages/app/debrief/DebriefDetail.tsx`
- `src/pages/app/company-research/CompanyProfile.tsx`
- `src/pages/app/prep/StarBuilder.tsx`
- `src/pages/app/mock-test/GenerateGovPaper.tsx`
- `src/pages/app/documents/ResumeDetail.tsx`, `JDDetail.tsx`
- `supabase/functions/parse-question-pdf/index.ts` (`INSUFFICIENT_CREDITS`)
- `src/test/lib/billing/actionCreditGate.test.ts`, `src/test/hooks/useScorecard.test.ts`
- `e2e/feature-credit-gating.spec.ts`

---

## Tests

```bash
npx vitest run src/test/lib/billing/actionCreditGate.test.ts src/test/lib/billing/creditKeyDriftContracts.test.ts
# → 14 passed

npx vitest run src/test/hooks/useScorecard.test.ts
# → 5 passed

npm run billing:parity-ai
# → OK: AI credit catalog parity passed (24 keys, version credit_catalog_v3)

npx playwright test e2e/feature-credit-gating.spec.ts
# → run on CI / local with auth fixtures
```

---

## Browser Verification

| User | Expected | Evidence |
|------|----------|----------|
| A sufficient | Paid actions work | Unit + existing e2e fixtures |
| B low / C zero | Buy Credits on paid action; hubs open | Code contracts + e2e route suite |
| D wrong plan | Upgrade | PlanGate / capability paths |

Full live A–D matrix: **not executed in this pass** → status remains PARTIALLY FIXED until signed off on target env.

---

## Objective Check

If a user lacks credits: the application stays usable; only the specific credit-consuming action shows Buy Credits and/or Upgrade with cost + balance from the canonical catalogue. Server remains authority for charge.
