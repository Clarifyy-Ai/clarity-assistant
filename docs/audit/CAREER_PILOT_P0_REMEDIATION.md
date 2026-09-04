# CAREER_PILOT_P0_REMEDIATION

## Status vocabulary

`RUNTIME_VERIFIED` | `IMPLEMENTED_NOT_RUNTIME_VERIFIED` | `IMPLEMENTED_WITH_DEFECT` | `PARTIAL` | `BLOCKED_BY_CONFIGURATION` | `BLOCKED_BY_DATA` | `BLOCKED_BY_EXTERNAL_PROVIDER` | `MISSING` | `DEPRECATED`

## P0 ledger (post-remediation)

| ID | Workstream | Final status | Root cause addressed | Remaining blocker |
|----|------------|--------------|----------------------|-------------------|
| P0-1 | Auth / MFA / onboarding | IMPLEMENTED_NOT_RUNTIME_VERIFIED | Dead email prop; hydrate soft-loop; MFA pause; returnTo | Live signup→verify evidence |
| P0-2 | Live Copilot | IMPLEMENTED_NOT_RUNTIME_VERIFIED | Silent start failures; capture-exclusion overclaim; browser system-audio claim | Deepgram/desktop runtime |
| P0-3 | Mock Interview | PARTIAL | TTS honesty; catalogue; Next/TTS idempotency; score evidence | Server TTS provider config |
| P0-4 | Government Exams | IMPLEMENTED_NOT_RUNTIME_VERIFIED | Credit release only on timeout; Official/PYQ mislabel risk | Python worker + inventory |
| P0-5 | Documents / Resume / JD | IMPLEMENTED_NOT_RUNTIME_VERIFIED | Binary/filename/object Object display; retry charge keys | Python DI health |
| P0-6 | Assessments | IMPLEMENTED_NOT_RUNTIME_VERIFIED | Silent generic when context thin; response RLS reaffirm | Deploy + types regen |
| P0-7 | Coding Assessments | PARTIAL | Non-JS languages implied; sandbox overclaim | Secure isolated sandbox MISSING |
| P0-8 | Session History | IMPLEMENTED_NOT_RUNTIME_VERIFIED | Failure shown as end-of-list | Cross-type runtime probe |
| P0-9 | Scorecards | IMPLEMENTED_NOT_RUNTIME_VERIFIED | Edge soft zeros; bare overall_score as complete | Deployed evaluation jobs |
| P0-10 | Debriefs | IMPLEMENTED_NOT_RUNTIME_VERIFIED | Pro entitlement alias blanks | Live Pro/Max evidence |
| P0-11 | Analytics | IMPLEMENTED_NOT_RUNTIME_VERIFIED | Processing scores in KPI | Dashboard reconciliation live |
| P0-12 | Billing / Razorpay | IMPLEMENTED_NOT_RUNTIME_VERIFIED | polish/screenshot/scorecard key drifts; Stripe-card QA copy | Test-mode webhook live |
| P0-13 | Referrals | IMPLEMENTED_NOT_RUNTIME_VERIFIED | Client grant risk clarified | Programme tables types lag |

## Evidence files (code)

- Auth: `ProtectedRoute.tsx`, `mfaGate.ts`, `accountBootstrap.ts`, `safeReturnTo.ts`
- Live: `useLiveCopilot.ts`, `screenCaptureEvasion.ts`, `sessionStartErrors.ts`
- Mock: `interviewerVoiceCatalog.ts`, `mockTts.ts`, `serverTts.ts`, `mock-tts` Edge
- Gov: `GenerateGovPaper.tsx`, `cancel-paper-generation-job`
- Scorecard: `generate-scorecard/index.ts`, `useScorecard.ts`
- Credits: `ai-credit-catalog-parity.mjs`, PrepLab → `polish-star-section`

## Decision

All P0 items remain **below RUNTIME_VERIFIED**. Aggregate: **NO_GO**.
