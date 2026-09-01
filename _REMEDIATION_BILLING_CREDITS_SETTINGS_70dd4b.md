# Career Pilot remediation report (workbook wave 3)

Workbook: `Clarify_AI_BB_Manual_QA_Workbook (2).xlsx`  
Scope: Billing, Credits, Scheduler, Integrations, Settings, Notifications, Dashboard, Sessions, Reports, Analytics, Answer Bank.  
**No Playwright / test / fixture / screenshot files were created.**

## Already-fixed (prompts 1–2) — skipped reimplementation

BillingHistory + `fulfilled`, past-due verify allowlist, promo UX, payment auth messaging, CSP `cdn.razorpay.com`, calendar 401→disconnected, edit `roundPrefilledRef`, cancelled filter, schedule `email_configured`, hotkey `Ctrl+Alt+A`, profile password toggles, settings persistence paths, NTF filters.

## New / reinforced this pass

| ID | Classification | Root cause | Change |
|----|----------------|------------|--------|
| TC-SES-002 | confirmed → fixed (UX/hardening) | Detail load could surface raw JWT/401; answers not owner-scoped in client | Auth-aware error; `listBySessionIdForUser` | 
| TC-SES-004 | configuration + messaging | Deepgram/STT unavailable blocked E2E | Clearer STT copy; auth vs not-configured in `deepgramToken` — still needs Deepgram secrets for voice |
| TC-SES-005 | incomplete proof (Pass caveated) | Isolation Pass without session fixtures | Owner-scoped answers + soft not-found already; do not treat as full E2E Pass |
| TC-AN-003 | confirmed → fixed | Weak-topic CTA was text-only | “Practice in Prep Lab” navigates `/app/prep?focus=` |
| TC-DASH-005 | confirmed → fixed | Pass claimed “Test Speed”; banner had dismiss only | “Test connection” refreshes Network Information + latency probe |
| TC-REP related | reinforced | Debrief related session used unscoped `getById` | `getByIdForUser` + owner answers |

## A–F summary (unchanged classifications)

- **BILL-001** expected host noise · **BILL-002/003** Razorpay config · **BILL-004** already-fixed · **BILL-005** code OK / E2E open · **BILL-006** fixed · **BILL-007/008** code OK · **REG-006/013/JRN-004** auth UX fixed / session config · **DEF-003** CSP in repo  
- **Credits CR-*** already-fixed in code · **REG-005** auth/config  
- **SCH-*** fixed or config (Google/Resend) · **INT/SET-010** Requires Configuration  
- **SET-*** persistence fixed in code (migration ops) · **NTF-*** fixed  

## G. Dashboard / Sessions / Reports / Analytics / Answer Bank

| ID | Classification | Notes |
|----|----------------|-------|
| TC-DASH-001…004,006…008 | already-fixed / Pass | Shortcuts, credits, empty, referrals, notifications entry OK |
| TC-DASH-005 | fixed | Test connection CTA |
| TC-SES-001,003 | already-fixed | Filters / empty |
| TC-SES-002 | fixed (hardening) | Detail auth UX + owner answers |
| TC-SES-004 | configuration | Deepgram; text mode allowed |
| TC-SES-005 | incomplete proof | Soft isolation; needs fixtures for full QA |
| TC-REP-001…005 | already-fixed / Pass caveats | Compare Pass only proved rejection; happy-path still ops/QA |
| TC-AN-001,002,004 | already-fixed | Ranges / empty / retry |
| TC-AN-003 | fixed | Weak topic → Prep Lab |
| TC-ANS-001…006 | already-fixed | CRUD, search, isolation, Practice Coach link |

## Files changed (this wave)

- `src/pages/app/sessions/SessionDetail.tsx`
- `src/lib/supabase/database.ts` (`listBySessionIdForUser`)
- `src/pages/app/debrief/DebriefDetail.tsx`
- `src/pages/app/Analytics.tsx`
- `src/components/layout/NetworkBanner.tsx`
- `src/lib/audio/deepgramToken.ts`
- `src/lib/audio/precheckStates.ts`

Prior wave (still in tree): BillingHistory, SettingsBilling, razorpayCheckout, billingPastDue, NewInterview, useCalendarSync, hotkeys, SettingsProfile/Hotkeys/Notifications, schedule-interview, index.html CSP.

## Migrations / Edge

- No new migrations this wave.  
- Previously deployed: `razorpay-*`, `disconnect-calendar`, `sync-calendar`, `schedule-interview`.  
- Settings columns still require `20260824233000_settings_contract_hardening` on prod if missing.

## Financial safety

- Server catalog amounts, JWT on create-order, signature verify, webhook fulfill, idempotency claim, no client credit bump, failed/cancelled do not grant, ledger history additive only.

## Remaining configuration

- Razorpay India sandbox methods + merchant validate/account health  
- Valid user JWT on deployed host  
- Google Calendar OAuth secrets  
- `RESEND_API_KEY` for email reminders  
- Deepgram secrets for live STT  
- Web host deploy of latest `index.html` CSP + Billing UI  

## Regression checks

- Cancelled interviews stay in Cancelled filter only  
- Integrations do not fake Connected  
- No wildcard CSP  
- Owner isolation on sessions/answers/debriefs/answer bank  
- STT down ≠ mic broken; text mode still available  

## Confirmation

No test or Playwright files were created for this remediation.
