# QA environment gaps (not product defects)

These items block **test execution** until ops provides the environment or fixtures.
Do **not** mark the related cases **Pass** until the gap is closed and evidence is captured.

| Gap ID | Source cases | Status | Resolution |
|--------|--------------|--------|------------|
| **QA-GAP-001** | TC-LIVE-005 | **Out of scope (web QA)** | Electron overlay requires a signed desktop build. Web testers mark **Blocked by Environment**. See `docs/ELECTRON_SMOKE_CHECKLIST.md` and `docs/ELECTRON_RELEASE.md`. |
| **QA-GAP-002** | TC-AUTH-015 | **Fixture script ready** | Run `npm run qa:seed-accounts` then `npm run qa:seed-mfa`. Use `QA_MFA_EMAIL` + `QA_MFA_PASSWORD` + `QA_MFA_TOTP_SECRET` from `.env.qa.local`. Do not Pass without MFA challenge screenshot. |
| **QA-GAP-003** | TC-ONB-001, TC-JRN-001 | **Fixture script ready** | Run `npm run qa:reset-fixtures` before onboarding journey tests. Uses `qa.onboarding@` (`QA_ONBOARDING_EMAIL`) with `onboarding_completed=false`. |
| **QA-GAP-004** | LOW_CREDIT_01, EXACT_CREDIT_01, ZERO_CREDIT boundary tests | **Fixed in seed** | Duplicate seed rows were overwriting `qa.lowcredit@` / `qa.exactcredit@`. Re-run `npm run qa:seed-accounts` and `npm run qa:reset-fixtures`. |
| **QA-GAP-005** | TC-BILL-003 (and related buy-credits cases) | **Ops: Razorpay Edge secrets** | Sync `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_ALLOW_TEST_KEYS` (test keys on prod). Webhook secret optional for closed-beta verify path. See [`TC_CR_002_TC_BILL_003.md`](./TC_CR_002_TC_BILL_003.md). Redeploy `razorpay-create-order`. |
| **QA-GAP-006** | TC-CR-002 | **Ops: Gemini + free-tier path** | Set `GEMINI_API_KEY`. Use `/app/usage` “Try a credit-consuming AI action” → Prep STAR polish (2 cr) or Rephraser (3 cr). Do not use Pro-only gov AI / Live overlay for this case. |
| **QA-GAP-007** | Google Calendar Connect / Disconnect (Integrations) | **Ops: Google OAuth Test users + Edge allowlist** | Sensitive scope `calendar.events`. Product soft-gates Connect until `GOOGLE_CALENDAR_PUBLIC_OAUTH=true` or email is in `GOOGLE_CALENDAR_TEST_USERS` (also add those Gmails as Google Console **Test users**). See [`GOOGLE_CALENDAR_OAUTH.md`](./GOOGLE_CALENDAR_OAUTH.md) / [`BUG27_CALENDAR_OAUTH_GATE_CHECKLIST.md`](./BUG27_CALENDAR_OAUTH_GATE_CHECKLIST.md). |

## Operator checklist

```bash
# Full QA credential + fixture refresh (staging project)
npm run qa:seed-accounts
npm run qa:reset-fixtures
npm run qa:seed-mfa          # only when running TC-AUTH-015
npm run qa:verify-login      # optional smoke (if script exists)

# Billing / AI / Google secrets → Edge (requires SUPABASE_ACCESS_TOKEN in .env.local)
npm run qa:sync-secrets
```

## Case classification rules

| Situation | Workbook result |
|-----------|-----------------|
| Electron-only step, no desktop installer in lab | **Blocked by Environment** (not Fail) |
| MFA account missing / no TOTP secret | **Blocked — QA-GAP-002** |
| Onboarding user already completed | **Blocked — QA-GAP-003** (reset first) |
| `LOW_CREDIT_01` / `EXACT_CREDIT_01` email missing in `.env.qa.local` | **Blocked — QA-GAP-004** |
| Buy credits → 503 / “Payments are not configured” | **Blocked — QA-GAP-005** (Razorpay Edge secrets) |
| No AI action deducts credits / Gemini not configured | **Blocked — QA-GAP-006** (set Gemini; use Prep path) |
| Calendar Connect → Google “Access blocked” / 403 access_denied | **Blocked — QA-GAP-007** (Test users + Edge `GOOGLE_CALENDAR_TEST_USERS`; general users should see Coming soon, not Access blocked) |

## Fixture map (after seed)

| Account ID | Email | Env keys | Credits / state |
|------------|-------|----------|-----------------|
| NEW_USER_01 | `qa.onboarding@clarify.ai.test` | `QA_ONBOARDING_*` | Onboarding incomplete |
| MFA_USER_01 | `qa.mfa@clarify.ai.test` | `QA_MFA_*`, `QA_MFA_TOTP_SECRET` | Verified TOTP after `qa:seed-mfa` |
| LOW_CREDIT_01 | `qa.lowcredit@clarify.ai.test` | `QA_LOW_CREDIT_*` | 5 credits |
| EXACT_CREDIT_01 | `qa.exactcredit@clarify.ai.test` | `QA_EXACT_CREDIT_*` | 3 credits (`create_mock_test` cost) |
| ZERO_CREDIT_01 | `qa.zero@clarify.ai.test` | `QA_ZERO_CREDIT_*` | 0 credits |

Passwords and TOTP secrets: **only** in gitignored `.env.qa.local`.
