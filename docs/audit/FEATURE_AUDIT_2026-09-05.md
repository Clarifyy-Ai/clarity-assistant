# Career Pilot — Complete Feature Audit (2026-09-05)

Implementation map and gap matrix for Practice Coach, Mock Interview, and Government Exams.

**Overall status: CODE COMPLETE — PARTIALLY FIXED end-to-end** until Phase 5 ops deploy + browser E2E pass on target environment.

## Implementation Map

| Feature | Route | Component | State | Service | Edge/API | DB | Provider |
|---------|-------|-----------|-------|---------|----------|-----|----------|
| Practice Coach | `/app/live`, `/app/live/overlay` | LiveRehearsal, LiveOverlay, PreSessionSetupWizard | LiveOverlayPhase, sessionStore, overlayProductSession | useLiveCopilot, useAudioSession | start-session, generate-hint, generate-answer, ai-coach-chat | sessions, coach_conversations | Gemini, Deepgram |
| Mock Interview | `/app/mock`, `/app/mock/session/:id` | MockInterview, MockSession, MockConversationPanel | answerNextFsm, mockHintBridge | generateMockQuestion, mockAnswerCapture | generate-questions, deduct-credits, finalize-session | sessions, session_answers | Deepgram TTS/STT |
| Gov Exams | `/app/mock-test/*` | MockTestHub, GenerateGovPaper, TestSession | GovExamPageShell, routeResolution | gov-exam api.ts | search-exams, check-exam-paper-availability, create-exam-paper, submit-test | mock_tests, gov_paper_jobs | Python worker |

## Final Audit Table

| Feature | Current State | Root Cause | Fixed | Browser Verified | Tests | Remaining |
|---------|---------------|------------|-------|------------------|-------|-----------|
| PC audio truth | PASS | RC-2 | Yes | NOT VERIFIED | OverlayAudioStatusBar + OverlayListeningIndicator mic health | — |
| PC frozen context | PASS | RC-3 | Yes | NOT VERIFIED | practiceCoachContext, sessionAiContext | — |
| PC fake AI fallback | PASS | RC-4 | Yes | NOT VERIFIED | modelRouter live path, coachChatSession | — |
| PC lifecycle | PASS | RC-1 | Yes | NOT VERIFIED | liveOverlayLifecycle.test | — |
| Mock FSM boot | PASS | RC-6 | Yes | NOT VERIFIED | answerNextFsm boot test | — |
| Mock overlay coupling | PASS | RC-5 | Yes | NOT VERIFIED | mockHintBridge, mockOverlayOptIn | — |
| Mock answer_source | PASS | — | Yes | NOT VERIFIED | durableMockTurns.test | — |
| Mock zero-answer guard | PASS | — | Yes | NOT VERIFIED | mockIncompleteSession.test | — |
| Gov PYQ safety | PASS | RC-7 | Yes | NOT VERIFIED | govInventorySingleSource, govOfficialPyqBlock | Ops deploy |
| Gov route FSM | PASS | RC-8 | Yes | NOT VERIFIED | GovExamPageShell.test + 5 pages wired | — |
| Gov gen timer | PASS | — | Yes | NOT VERIFIED | govPaperReviewSession server started_at | — |
| Credits canonical | PASS | RC-9 | Yes | N/A | ai-credit-catalog-parity.mjs | — |
| hint_style contract | PASS | — | Yes | NOT VERIFIED | hintStyleContract.test + start-session payload | — |
| AI rendering | PASS | RC-10 | Yes | NOT VERIFIED | DebriefDetail, SessionDetail, overlay, results | — |
| Ops deploy | BLOCKED | Migration/edge/Python | Artifacts ready | NOT VERIFIED | scripts/ops-gov-exam-gate.mjs | ENV gate |

## Browser E2E Evidence Matrix

Automated browser matrix not executed in this remediation sprint (no live app credentials / staging URL in CI agent). Unit + contract tests below substitute for code-path verification.

| Route | Account | Critical path | Console/Network | Verdict |
|-------|---------|---------------|-----------------|---------|
| `/app/live` → overlay | Pro + credits | Wizard → hint → end | NOT RUN | NOT VERIFIED |
| `/app/mock` | Pro | 5Q session → scorecard | NOT RUN | NOT VERIFIED |
| `/app/mock/warmup` | Free | Warmup free | NOT RUN | NOT VERIFIED |
| `/app/mock-test` | India profile | Search → detail | NOT RUN | NOT VERIFIED |
| `/app/mock-test/generate` | Pro + credits | Availability → generate | NOT RUN | NOT VERIFIED |
| `/app/mock-test/session/:id` | In-progress | Timer → submit → results | NOT RUN | NOT VERIFIED |
| Deep link logged out | Any | Login → returnTo | NOT RUN | NOT VERIFIED |

**Recommended manual gate:** run `e2e/remediation-smoke.spec.ts`, `e2e/gov-exam-generation.spec.ts`, `e2e/live-mock-session-smoke.spec.ts` against staging before marking browser column PASS.

## Regression Tests Executed (2026-09-05)

```
OK: AI credit catalog parity passed (24 keys, version credit_catalog_v3)
OK: Ops gate artifact checks passed (scripts/ops-gov-exam-gate.mjs)
vitest: session + mock + gov-exam + overlay health + livePracticeCoach contracts
```

Run locally:
```bash
node scripts/ops-gov-exam-gate.mjs
node scripts/ai-credit-catalog-parity.mjs
npx vitest run src/test/lib/session src/test/lib/mock src/test/lib/gov-exam
```

## Phase 5 — Ops Checklist (ENVIRONMENT BLOCKER)

Gov Exams cannot be marked **FIXED end-to-end** until all steps PASS on target environment:

| Step | Action | Status |
|------|--------|--------|
| 1 | Apply migration `20260905140000_gov_exam_inventory_public_pyp_fix.sql` | PENDING |
| 2 | Deploy edge functions per `REMOTE_FUNCTION_ALLOWLIST.txt` (create-exam-paper, check-exam-paper-availability, submit-test, search-exams) | PENDING |
| 3 | Verify Python worker `/internal/gov-exams/process-job` reachable | PENDING |
| 4 | Run checklist in `docs/gov-exam/GOV_EXAM_PRODUCTION_CERTIFICATION.md` | PENDING |

## Root Causes (RC-1 … RC-10) — Fix Summary

| RC | Fix |
|----|-----|
| RC-1 | `promoteOverlayProductSessionWhenReady` gates active on pipeline health |
| RC-2 | Mic Active UI requires `micHealth === "active"` |
| RC-3 | Full resume/JD freeze; read-only overlay resume tab |
| RC-4 | Recoverable errors instead of offline talking-points as AI |
| RC-5 | `mockHintBridge` + inline hint UI; overlay opt-in only |
| RC-6 | Q1 boot: `RESET → START_GENERATING → QUESTION_READY` |
| RC-7 | `sourcePolicyForMode()` shared by availability + create |
| RC-8 | `GovExamPageShell` + `GovExamRouteState` on hub, detail, generate, session, results |
| RC-9 | Catalog v3; `utils.deductCredits` uses `resolveActionCost` |
| RC-10 | `AiFormattedOutput` on overlay chat/hint stream, test results AI section |
