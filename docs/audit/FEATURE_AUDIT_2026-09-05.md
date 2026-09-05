# Career Pilot — Complete Feature Audit (2026-09-05)

Implementation map and gap matrix for Practice Coach, Mock Interview, and Government Exams.

## Implementation Map

| Feature | Route | Component | State | Service | Edge/API | DB | Provider |
|---------|-------|-----------|-------|---------|----------|-----|----------|
| Practice Coach | `/app/live`, `/app/live/overlay` | LiveRehearsal, LiveOverlay, PreSessionSetupWizard | LiveOverlayPhase, sessionStore, overlaySessionAuthority | useLiveCopilot, useAudioSession | start-session, generate-hint, generate-answer, ai-coach-chat | sessions, coach_conversations | Gemini, Deepgram |
| Mock Interview | `/app/mock`, `/app/mock/session/:id` | MockInterview, MockSession, MockConversationPanel | answerNextFsm, questionGenerationFsm | generateMockQuestion, mockAnswerCapture | generate-questions, deduct-credits, finalize-session | sessions, session_answers | Deepgram TTS/STT |
| Gov Exams | `/app/mock-test/*` | MockTestHub, GenerateGovPaper, TestSession | routeResolution FSM, govPaperReviewSession | gov-exam api.ts | search-exams, check-exam-paper-availability, create-exam-paper, submit-test | mock_tests, gov_paper_jobs | Python worker |

## Gap Matrix

| Feature | Current State | Root Cause | Fix | Browser Verified | Tests | Remaining |
|---------|---------------|------------|-----|------------------|-------|-----------|
| PC audio truth | FAIL | RC-2 isCapturing ≠ flow | Health model + UI gates | NOT VERIFIED | In progress | — |
| PC frozen context | PARTIAL | RC-3 summary-only freeze | Full text + read-only tab | NOT VERIFIED | In progress | — |
| PC fake AI fallback | FAIL | RC-4 offline templates as AI | Recoverable errors | NOT VERIFIED | In progress | — |
| PC lifecycle | PARTIAL | RC-1 parallel FSMs | Lifecycle coordinator | NOT VERIFIED | In progress | — |
| Mock FSM boot | PARTIAL | RC-6 Q1 skips states | Wire loading→generating | NOT VERIFIED | In progress | — |
| Mock overlay coupling | PARTIAL | RC-5 always bootstraps overlay | Optional adapter | NOT VERIFIED | In progress | — |
| Mock answer_source | PARTIAL | Always "spoken" | typed/spoken/mixed | NOT VERIFIED | In progress | — |
| Gov PYQ safety | FAIL | RC-7 create vs check policy | sourcePolicyForMode | NOT VERIFIED | In progress | — |
| Gov route FSM | PARTIAL | RC-8 unwired component | Wire GovExamRouteState | NOT VERIFIED | In progress | — |
| Credits canonical | PARTIAL | RC-9 v2/v3 drift | Catalog v3 unification | NOT VERIFIED | In progress | — |
| AI rendering | PARTIAL | RC-10 raw pre-wrap | AiFormattedOutput rollout | NOT VERIFIED | In progress | — |
| Ops deploy | BLOCKED | Migration/edge/Python | Phase 5 checklist | NOT VERIFIED | N/A | ENV |

## Root Causes (RC-1 … RC-10)

See plan document for full RC descriptions. Fixes applied in code during this remediation sprint.

## Environment Blockers (separate from code)

- Migration `20260905140000_gov_exam_inventory_public_pyp_fix.sql` must be applied on target DB
- Edge functions must be deployed per REMOTE_FUNCTION_ALLOWLIST.txt
- Python paper factory worker must be reachable for async generation
