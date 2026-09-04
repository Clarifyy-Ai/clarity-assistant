# Government Exam — route and redirect audit

## Canonical app paths (Phase 1)

| User journey | Canonical path | Prompt alias (deferred rename) |
|--------------|----------------|--------------------------------|
| Hub / search | `/app/mock-test` | `/app/government-exams` |
| Exam detail | `/app/mock-test/exam/:examCode` | `/app/government-exams/:code` |
| Generate | `/app/mock-test/generate` | `/app/government-exams/generate` |
| Attempt | `/app/mock-test/session/:testId` | `/app/government-exams/session/:id` |
| Results | `/app/mock-test/results/:testId` | `/app/government-exams/results/:id` |

Path names stay `/app/mock-test/...` until a dedicated rename PR.

## Route-resolution contract

Every gov deep link must resolve to one of:

1. **Auth loading** — skeleton on the same URL
2. **Unauthenticated** — `/login?returnTo=<full path+query>` (sanitized)
3. **Verify / MFA / onboarding** — preserve `returnTo` / `location.state.from`; on success restore that path (not a hard-coded dashboard)
4. **Eligible** — load resource by URL id
5. **Valid** — render
6. **Not found / unavailable** — in-place empty state (optional Back to Hub CTA)
7. **Temporary backend failure** — Retry on the same URL (**no** auto-redirect to hub)

Auth / email / MFA / onboarding gates remain enforced; only the return path and error classification change.

## Redirect chains fixed (P0)

| Before | After |
|--------|--------|
| Login → verify/MFA/onboarding dropped deep link → `/app/dashboard` | `preferredReturnTo` / `state.from` threaded through Login, VerifyEmail, MfaEnroll, AuthCallback, OnboardingIndex, `useAuth.completeOnboarding` |
| Marketing Gov Exams “Log in” → `/login` | `/login?returnTo=%2Fapp%2Fmock-test` |
| MFA re-enroll `Navigate` without `from` | `state={{ from: location }}` |
| `TestSession` missing/5xx → `navigate("/app/mock-test")` | In-place `EXAM_NOT_FOUND` / temporary failure + Retry |
| `TestResults` missing analysis → hub | Stay on results with Processing + Retry |
| `getAuthenticatedEntryPath` ignored return URL | Accepts `preferredReturnTo` via `sanitizeReturnTo` |

## Guards that still redirect (by design)

- `ProtectedRoute`: unauthenticated → login with returnTo; unverified → verify-email; MFA step-up; onboarding incomplete → `/onboarding` with `state.from`
- Completed attempt opened on session URL → results URL
- Incomplete attempt opened on results URL → session URL

## Intentionally deferred

- Renaming routes to `/app/government-exams/*`
- Killing Quick Drill / legacy `ExamPapers` `launchMockTest` fork (second chain; registry exams already go to generate)
