# Career Pilot Root Remediation — Verification Report (Part W)

**Date:** 2026-09-05  
**Environment:** Local dev + Vitest contract tests  
**Aggregate FINAL STATUS:** **PARTIALLY FIXED**

Runtime browser verification with live Gemini/Deepgram secrets was **NOT VERIFIED** in this pass. Code + contract tests pass locally.

---

## 1. Root Causes (grouped)

| ID | Root cause | Status |
|----|------------|--------|
| RC-1 | Split AI contracts (hint_style ignored on generate-hint/answer) | FIXED in code |
| RC-2 | Transcript → AI Help pipeline gap | FIXED in code |
| RC-3 | Mock ↔ Live Overlay coupling | FIXED (optional overlay) |
| RC-4 | Mock Q/A FSM races | FIXED in code |
| RC-5 | Opaque 503 / provider errors | FIXED (typed codes + edgeErrors) |
| RC-6 | False success before persistence | FIXED (Rephraser, Answer Bank) |
| RC-7 | Auth bootstrap mutex / profile timeout | FIXED (guard + backoff) |

---

## 2. Live Copilot — **PARTIAL** (NOT RUNTIME VERIFIED)

- `getLatestInterviewerQuestion()` + `triggerManualAiHelp()` wired
- `hint_style` / `coach_tone` sent to `generate-hint` / `generate-answer`
- Share-audio explicit state machine; banner hides when ACTIVE
- **Blocked without:** Edge `GEMINI_API_KEY`, Deepgram token, live STT in browser

---

## 3. Mock Interview — **PARTIAL**

- Page-native `MockConversationPanel` default; overlay opt-in via toggle
- FSM: VAD blocks silence finalize; overlay pipeline sync on finalize/pending
- **NOT VERIFIED:** full voice turn-taking in browser with TTS provider

---

## 4. Prep Lab — **PARTIAL**

- Rephraser success only after DB + Answer Bank save
- `AiFormattedOutput` for coding explain
- Answer Bank 10-char validation aligned with DB trigger
- **NOT VERIFIED:** end-to-end Rephraser → Answer Bank list in browser

---

## 5. Government Exams — **PARTIAL**

- `check-assessment-availability` returns typed 503 + `retryable`
- Preflight shows retry message for 503
- **NOT VERIFIED:** full generation → runner → submit with Python worker

---

## 6. Assessments — **PARTIAL**

- Preflight fail-closed; 503 retry copy
- 18 lifecycle unit tests pass
- **NOT VERIFIED:** live assessment start/submit in browser

---

## 7. Authentication — **PARTIAL**

- `runWithBootstrapGuard` releases mutex in `finally`
- Profile load exponential backoff
- 23 accountBootstrap tests pass
- **NOT VERIFIED:** OAuth callback on production domain

---

## 8. AI Providers

| Provider | Configured | Working | Fallback | Notes |
|----------|------------|---------|----------|-------|
| Gemini | Server-side | NOT VERIFIED | Yes (OpenAI/Anthropic) | Keys required on Edge |
| OpenAI | Server-side | NOT VERIFIED | Secondary | — |
| Anthropic | Server-side | NOT VERIFIED | Tertiary | — |

---

## 9. Credit System — **PASS** (contracts)

- Hybrid single-reserve + refund on total failure (existing + tests)
- `edgeErrors` distinguishes CREDIT_ERROR vs PROVIDER_ERROR

---

## 10. RLS/Security — **PASS** (no weakening)

- No RLS changes in this pass

---

## 11. Loading UX — **PARTIAL**

- Real stages preserved; no fake percentages added
- Rephraser/Answer Bank honest save states

---

## 12. Responsive UI — **NOT VERIFIED**

- Overlay minimal mode exists; full viewport matrix not run

---

## 13. Console — Remaining

- Live AI paths may log provider 503 until Edge secrets configured

---

## 14. Network — Remaining

- `ai-coach-chat` / `generate-hint` 503 expected without provider keys

---

## 15. Database

- No schema changes required for this pass

---

## 16. Files Changed (primary)

**Shared AI:** `practiceCoachContract.ts` (edge + client), `domainErrors.ts`, `generate-hint/index.ts`, `generate-answer/index.ts`, `geminiClient.ts`, `edgeErrors.ts`

**Live:** `interviewerQuestions.ts`, `useLiveCopilot.ts`, `LiveOverlay.tsx`, `OverlayWindow.tsx`, `OverlayHintPanel.tsx`, `OverlaySystemAudioBanner.tsx`, `shareAudioState.ts`

**Mock:** `MockSession.tsx`, `MockConversationPanel.tsx`, `silencePolicy.ts`, `answerNextFsm.ts`

**Prep:** `Rephraser.tsx`, `AnswerBank.tsx`, `CodingHints.tsx`, `AiFormattedOutput.tsx`

**Gov/Auth:** `check-assessment-availability/index.ts`, `assessmentPreflight.ts`, `accountBootstrap.ts`, `authStore.ts`

**Tests:** `remediationContracts.test.ts`, `interviewerQuestions.test.ts`, `answerNextOverlay.test.ts`, `AiFormattedOutput.test.tsx`, `e2e/remediation-smoke.spec.ts`, updated `coachChatContinuity.test.ts`, `hybridFallbackContracts.test.ts`

---

## 17. Tests

```bash
npx vitest run src/test/lib/remediationContracts.test.ts src/test/lib/ai/coachChatContinuity.test.ts src/test/lib/edge/hybridFallbackContracts.test.ts src/test/lib/mock src/test/lib/auth/accountBootstrap.test.ts
# 60+ remediation-focused tests PASS
```

---

## 18. Browser Verification

| Route | Action | Expected | Actual | Result |
|-------|--------|----------|--------|--------|
| `/app/interview-day` | Load checklist | Toggles persist | Unit tests pass | PARTIAL |
| `/app/mock` | Native panel | No overlay by default | Code review | PARTIAL |
| `/app/live` | AI Help | Uses latest interviewer Q | NOT RUN | NOT VERIFIED |
| `/app/prep/rephraser` | Save | DB before toast | NOT RUN | NOT VERIFIED |

---

## 19. Remaining Issues

| Item | Status |
|------|--------|
| Live Copilot with real STT + Gemini | NOT VERIFIED |
| Gov exam full generation | NOT VERIFIED |
| Responsive viewport matrix | NOT VERIFIED |
| Deploy Edge function changes | BLOCKED (needs `supabase functions deploy`) |

---

## 20. FINAL STATUS

**PARTIALLY FIXED**

All planned code changes and local contract tests are complete. Mark **FIXED** only after staging browser verification with configured provider secrets.
