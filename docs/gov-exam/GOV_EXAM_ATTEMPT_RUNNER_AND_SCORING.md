# GOV_EXAM_ATTEMPT_RUNNER_AND_SCORING

## Start / resume

- Edge `start-exam` idempotent — refresh returns same `mock_tests` row, same `started_at` / `expires_at`
- Route: `/app/mock-test/session/:testId`
- No second attempt on double-click or refresh

## Timer

- Authoritative: server `started_at`, `expires_at`, `submitted_at`
- Client: `src/lib/gov-exam/examTimer.ts` derives remaining from server
- Expiry: lock answers, flush save, auto-submit once

## Autosave

- `save-test-answer` per question snapshot with version
- Debounced in `TestSession.tsx`
- Blocked after submit (`shouldBlockAnswerAutosave`) — no post-submit 409 storm
- Tests: `attemptAnswerPersistence.test.ts`, `TestSession.autosaveRace.test.ts`

## Submit

- `submit-test` with idempotency `submit:<testId>`
- Duplicate submit returns same result
- Redirect to results when keys revealed

## Scoring

- Deterministic from frozen paper snapshots + persisted responses
- No AI for objective marks
- Zero is valid; missing analysis → Processing on results page (not invented zero)

## Immutable paper

Runner loads questions from `gov_generated_paper_questions` / attempt config — never live mutable bank.

## Tests

- `mockTestScoring.test.ts`
- `e2e/gov-exam-session.spec.ts`

See: `docs/gov-exam/GOV_EXAM_IDENTIFIER_AND_DATA_CONTRACT.md` (attempt lifecycle section).
