# 30-08-2026 QA remediation — evidence pack

**Release status: NO_GO**

P0 generation, credits, bootstrap, session detail, and account deletion have unit/contract coverage. They do **not** have live runtime proof on the linked project until migrations + Edge + Python worker are applied and a completed paper is produced. External OAuth/email/Calendar may be CONFIGURATION_BLOCKED only after broken CTAs are hidden.

## Test commands

```
npx vitest run src/test/lib/gov-exam src/test/lib/edge/govExamCreditContracts.test.ts src/test/lib/edge/prepToolCreditFirst.test.ts src/test/lib/edge/deleteAccountIdempotency.test.ts src/test/lib/schedule src/test/lib/billing/creditCatalogParity.test.ts src/test/lib/sessions/ownedSessionDetail.test.ts src/test/lib/auth/onboardingGovExamRecovery.test.ts src/test/lib/auth/formatSupabaseAuthError.test.ts src/test/lib/auth/mfaGate.test.ts
```

Result: **23 files, 129 tests, exit 0**.

```
cd scraper && python -m pytest tests/test_paper_credit_compensation.py -q
```

Result: **11 passed, exit 0**.

## Per-defect IDs

| ID | Root cause | Fix | Proof |
|---|---|---|---|
| TC-GOV-007/008/011/024, TC-API-004/005 | Poll used SESSION_ACTION 20/min | JOB_POLL preset + 2s→15s backoff; 429/5xx stay in-flight | `pollPaperJob.test.ts` |
| TC-GOV-020 | Charge before paper exists | Reserve columns + finalize/release RPCs; release on `failed_retryable` | `govExamCreditContracts.test.ts`, Python compensation |
| TC-GOV-011 | No Retry after poll fail | Retry UI; new idempotency only after terminal fail | GenerateGovPaper + poller |
| DEF-013 / TC-GOV-010 | Bootstrap trap | Gov browse during recovery + pre-profile | `govExamRoutes.test.ts` |
| TC-GOV-022 | PDF 502 no refund | parse-question-pdf 504 + refund | function source |
| TC-AUTH-008 | Raw `email_not_confirmed` | `formatSupabaseAuthError` on login + OAuth | `formatSupabaseAuthError.test.ts`, `auth-onboarding.spec.ts` |
| TC-AUTH-014 | Broken Google CTA | Hide when `isOAuthProviderEnabled` is false | oauth tests |
| TC-AUTH-010 / D-012 | Reset width + inbox copy | AuthShell max-w-md; spam/wait copy | ResetPassword + AuthShell |
| TC-AUTH-015 | MFA paused | `MFA_ENFORCEMENT_PAUSED = false` | `mfaGate.test.ts` |
| TC-ONB-002/004/005/006/007 | No fixture / popstate | Seed `qa.onboarding@`; persist `onboarding_step` on Next/Back | seed script + OnboardingIndex |
| TC-SES-002 | Session detail 500 | `get_owned_session_detail` owner RPC; Not scored | `ownedSessionDetail.test.ts`, `session-ownership.spec.ts` |
| TC-SET-015 | Delete 429 on retry | Skip rate limit when `existingOp` exists | `deleteAccountIdempotency.test.ts` |
| TC-SCH-002/003 | Local Date parse | IANA `zonedWallTimeToUtc` + Zod schema | `zonedWallTime.test.ts`, `interviewScheduleSchema.test.ts` |
| TC-SCH-004 / TC-SET-010 | Calendar 501 Connect | Disabled Not configured when probe 501 | SettingsIntegrations |
| TC-SCH-005 | Reminder email | Honest “email not configured” when Resend missing | NewInterview + schedule-interview |
| TC-CR-003 | Zero-credit 400 unknown tool | 402 before `tool_id`; `raw_prompt` alias | `prepToolCreditFirst.test.ts` |
| TC-CR-004/005 | Past-due reused | Separate `qa.lowcredit@` / `qa.exactcredit@` | `scripts/seed-qa-accounts.mjs` |
| TC-BILL-007 | Refunds N/A | BillingHistory refund filter from ledger | SettingsBilling |
| TC-PUB-004 | FAB vs Login | Marketing FAB `bottom-20 md:bottom-6` | SupportChatWidget + visual spec |
| TC-PUB-014 | Contact Sales | Existing mailto in MarketingLayout | no dead href change |
| D-013 / TC-RSP-006/007 | Blank band | Centered PublicErrorState + VerifyCertificate | visual regression viewports |
| DOCX-30-001/002 | Catalog drift | Help fallback from `creditEconomics` | `creditCatalogParity.test.ts` |
| DOCX-30-003 | Duplicate icons | Overlay GripVertical; Dashboard Coins vs TopBar Zap | unique aria-labels |
| TC-PREP-003 | prep-tool 401/unknown | JWT already via fetchEdge; credit-first + raw_prompt | prep-tool |
| TC-ADM-022 | Topic Apply-only + dual empty | Live debounce + one empty card | AdminGovQuestionReview |

## Deploy

Attempted on linked project `qzgvjrvtkwlzxpmlddkx` (Clarify.AI).

- `npx supabase db push --dry-run` prompted for the database password and could not complete unattended.
- `npx supabase@latest functions deploy … --use-api` uploaded assets, then failed with `FunctionsApiTransportError` (CLI v1 also requires Docker Desktop, which is not running).
- Python `paper_factory` / `gov_exams.engine` was not shipped to Render from this session.

Until migrations, Edge, and the Python worker are live **and** a completed paper exists, keep **NO_GO**.

Apply migrations first:

- `supabase/migrations/20260831120000_gov_paper_job_credit_reservation.sql`
- `supabase/migrations/20260831130000_owned_session_detail.sql`

Then Edge: `create-exam-paper`, `get-paper-generation-job`, `check-exam-paper-availability`, `process-paper-generation-job`, `cancel-paper-generation-job`, `generate-topic-practice`, `parse-question-pdf`, `extract-question-paper`, `prep-tool`, `delete-account`, `schedule-interview`.

Python `paper_factory` / `gov_exams.engine` must ship with the scraper host (Render). Until that deploy + a live completed paper, runner cases TC-GOV-015–019 stay blocked and the module stays **NO_GO**.
