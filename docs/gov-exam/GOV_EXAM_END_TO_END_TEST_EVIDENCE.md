# Government Exam — end-to-end test evidence

## Automated (repo)

| Layer | Evidence |
|-------|----------|
| Unit | `emailVerificationGate.test.ts` — `preferredReturnTo` / `getPostOnboardingPath` |
| Unit | `pollPaperJob.test.ts` — soft `GENERATION_STILL_RUNNING` (no invented `failed_retryable`) |
| Unit | `attemptAnswerPersistence.test.ts` / `TestSession.autosaveRace.test.ts` — autosave blocked after submit |
| E2E | `e2e/gov-exam-generation.spec.ts` — returnTo → generate; hub Resume banner → `jobId` |
| E2E | `e2e/gov-exam-session.spec.ts` — refresh restores answers; submit once; no save storm |
| Blackbox | `TC-GOV-007` / `TC-GOV-010` — require redirect + durability proof (not page-open alone) |

## Manual / live acceptance journey

1. Deep link `/app/mock-test/generate?...` while logged out → login → (verify/MFA/onboarding if needed) → **same generate URL**, not Dashboard-only.
2. Open invalid `session/:id` / `results/:id` → Not Found / Retry **on same URL**.
3. Start Generate → refresh → same `jobId`; leave hub → Resume generation CTA.
4. Let client poll soft-exit → Continue waiting; credits not released solely by poll timeout.
5. Review availability counts match Generate for same snapshot id / source label.
6. Start attempt → answer → refresh → answers + timer from `expires_at` → submit once → Results + Session History `detailRoute` agree.
7. User B denied on User A attempt/results URLs.

## Environment blockers

Undeployed Edge/Python → record **Blocked** (BLK-EDGE / BLK-PY), not product Fail.
