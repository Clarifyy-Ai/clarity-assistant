# QA Catalog → Test & Fix Implementation

## What you're asking for

Test all 1,003 items in `clarify-ai-qa-checklist.xlsx` and fix anything that fails.

## Reality check

The catalog contains **1,003 items**: 173 P0 + 54 P1 + 759 P2 + 17 P3. Honestly testing every item — and fixing every gap — is a multi-week effort, not a single sprint. Many items are inherently **manual** (real OAuth popups, real Stripe checkout, real microphones, real screen-share stealth, OS notifications, multi-browser visual checks) and cannot be automated in this sandbox. Others describe features that **don't exist yet** in the codebase (e.g. "Account lockout after 5 failed attempts", "Session timeout warning 5 minutes before expiry", "Reset link expires after 1 hour" with explicit UI) — those are not test failures, they're missing features.

So I'll do this in a **focused, layered pass** that gives you the most coverage and the most fixes for one sprint of work.

## Plan

### Phase 1 — Foundation (one batch)
- Parse `clarify-ai-qa-checklist.xlsx` into `src/test/_generated/catalog.json` (T-ID indexed).
- Add test utilities: `src/test/_utils/renderWithProviders.tsx`, `supabaseMock.ts`, `fixtures.ts`.
- Extend `src/test/setup.ts` with `crypto.randomUUID`, `ResizeObserver`, `IntersectionObserver`, `URL.createObjectURL` polyfills.

### Phase 2 — Automated tests for all P0/P1 that are automatable (~200 tests)
Vitest + RTL, every test tagged with its T-ID in the name. Coverage by area:

| Area | Files |
|---|---|
| Validators | `emailValidator`, password-strength logic |
| Stores | `authStore`, `sessionStore`, `overlayStore`, `notificationStore` |
| Hooks | `useAuth`, `useCredits`, `usePrivateMode`, `useHotkeys`, `useNetworkMonitor`, `useSessionOrchestrator`, `useDocumentManager` |
| Billing | `creditsManager`, `creditDeductionMiddleware`, `priceCalculator` |
| AI | `questionDetection`, `modelRouter`, `promptTemplates` |
| Audio | `wpmTracker`, `fillerDetector`, `speechMetricsCalculator`, `silenceDetector` |
| Overlay | `hotkeys`, `stealthActions`, `screenCaptureBlocker` |
| Components | `LoginForm`, `SignupForm`, `OAuthButton`, `CommandPalette`, `CookieConsent`, `ProtectedRoute`, `PlanGate`, `CreditBalance`, `UpgradeModal`, `DebriefExtras`, `Whiteboard`, `CodeScratchpad` |
| Utils | `formatters`, `dateUtils`, `hashUtils`, `fileUtils` |

### Phase 3 — Run, triage, fix
- Run `vitest run --reporter=json`.
- For each **failing** test that reflects a real bug (not a missing feature), fix the underlying code. Examples likely to surface:
  - Email validator edge cases
  - Credit deduction returning wrong "remaining" on race
  - Hotkey parser case-sensitivity
  - CommandPalette Escape vs nested-modal behavior
  - PlanGate gating wrong feature → plan map
  - Filler detector false positives on punctuation
- Re-run until green.

### Phase 4 — Manual scripts + placeholders + report
- `docs/QA_MANUAL.md` — step-by-step manual scripts for ~25 P0/P1 items that need real browsers / hardware / external services (each tagged with its T-ID).
- `src/test/_placeholders/p2_p3_todos.test.ts` — auto-generated `it.todo("T-XXXX – …")` for every unautomated P2/P3, so they appear in the test report and remain traceable.
- `scripts/update-qa-status.py` — reads vitest JSON, writes Status back to a fresh `clarify-ai-qa-checklist-v2.xlsx` with values: `Automated & Passing`, `Automated – Failing (fixed)`, `Manual`, `Spec missing`, `TODO`.
- `docs/QA_REPORT.md` — the full section-6 deliverable: high-level summary, coverage table by area, P0/P1 dashboard, implementation notes, manual scripts, and a **bugs-fixed** + **spec-gaps** list.

## What I will NOT do (and why)

- **Real Playwright E2E**: this sandbox can't run a stable browser farm; the existing `playwright.config.ts` is a stub. E2E flows are documented as manual.
- **Hit real Supabase / Stripe / Deepgram / Gemini** in tests — all mocked.
- **Implement missing features** named in the catalog but absent from code (lockout, session-timeout warning UI, etc.). These get listed as "Spec missing — recommend follow-up sprint" in the report rather than silently built.
- **Test all 759 P2 items individually** — they become `it.todo` placeholders, traceable by T-ID. Promoting them to real tests is a follow-up.

## Expected deliverables

- ~200 new automated tests, all green.
- ~5–15 real bug fixes in app code (exact count depends on what failures surface).
- Updated `clarify-ai-qa-checklist-v2.xlsx` with synced statuses.
- `docs/QA_MANUAL.md` with manual scripts.
- `docs/QA_REPORT.md` with the full report, bug list, and spec-gap list.

## Time estimate

One long sprint, roughly: 1 batch foundation, 3 batches writing tests, 1–2 batches triage/fix, 1 batch report. Reply **approve** and I'll execute end-to-end, surfacing the report and artifact at the end.
