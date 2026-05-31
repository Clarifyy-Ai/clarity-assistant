## Phase 4B — completed

- **`.maybeSingle()` migration** for lookup-by-id sites where 0 rows is a legitimate "not found":
  - `useXPSystem.ts`, `useStreakTracker.ts`, `useGamification.ts` (×3), `useAnalytics.ts`, `useScorecard.ts` (×2)
  - `authStore.ts` (profile load + refreshCredits — post-update `.select().single()` kept, always returns)
  - `subscriptionManager.ts`, `creditsManager.ts`
  - `ResumeDetail.tsx`, `JDDetail.tsx`, `DebriefDetail.tsx`, `SessionDetail.tsx`, `TestSession.tsx`, `TestResults.tsx`
  - Skipped: `database.ts` (already wrapped in `query()` helper with error handling), `OnboardingStep5ResumeUpload`/`SettingsModels`/`AdminQuestionEditor` (insert/upsert with `.select().single()` — row guaranteed).

- **AdminDashboard** — try/catch around `fetchStats` with `error` state, toast on failure, inline retry card.

- **useXPSystem** — left as-is: already rolls back optimistic XP on failure and logs to console. Adding toasts would be noisy for a non-critical background action (per "do not modify existing working features" guardrail).

## Phase 5 (not started)
- N+1 query elimination (`SessionVolumeChart` 7 sequential count queries, etc.)
- Hard-coded anon-key consolidation
- `/settings/byok` decision
