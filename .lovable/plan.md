## Audit findings

- The current preview crash is concrete: `SessionDetail.tsx` renders `<ChevronRight />` but does not import `ChevronRight` from `lucide-react`.
- Live sessions currently create/activate a session in multiple places, but there is no clean prepared → started → paused → resumed → completed lifecycle exposed to the user.
- `LiveSessionController` only warns when time is up; it does not automatically end/persist the session.
- Mock tests start immediately on page load by changing `DRAFT` to `IN_PROGRESS`, which prevents a proper “created first, then start” flow.
- Mock test autosave depends on a response interval tied to changing `responses`, which can create repeated interval resets and unreliable saves.
- Credits are fragmented: mock test creation deducts credits in the `create-test` edge function, live answer generation deducts elsewhere, and the client credit hook reads from `profiles` only. The UI can go stale unless balances are refreshed after paid actions.

## Guardrails

- Do not modify authentication, onboarding, marketing/SEO, payments, admin, or unrelated dashboard features.
- Do not loosen RLS/security changes already applied to credits.
- Do not move roles onto `profiles` or client storage.
- Preserve existing mock test data model (`mock_tests`, `test_responses`, `test_analyses`) unless a migration is strictly required.
- Keep changes component-by-component and validate each affected flow before moving to the next.

## Implementation plan

### 1. Fix the immediate production crash

- Add the missing `ChevronRight` import in `src/pages/app/sessions/SessionDetail.tsx`.
- Verify the session detail page renders instead of showing “Unexpected Application Error”.

### 2. Define a reliable session lifecycle

Implement a single shared lifecycle in `src/lib/session/sessionLifecycle.ts`:

```text
pending/created → active/started → paused → active/resumed → completed
                         ↓
                    abandoned/expired
```

- Keep `getOrCreateSession` for creating/reusing a pending session.
- Add/update helpers for:
  - `prepareSession` / create pending row
  - `startSession` / activate pending row
  - `pauseSession`
  - `resumeSession`
  - `completeSession`
  - `expireSessionIfNeeded`
- Ensure sessions past their configured duration automatically close as `completed` or `abandoned` consistently.

### 3. Enhance the overlay live-session flow

Update only the live overlay/session components:

- `src/pages/app/live/LiveOverlay.tsx`
- `src/pages/app/live/LiveRehearsal.tsx`
- `src/hooks/useLiveCopilot.ts`
- `src/components/live/LiveSessionController.tsx`
- `src/store/sessionStore.ts`

Changes:

- First create a pending session after setup.
- Show a clear “Start session” state before audio/overlay begins.
- Add pause/resume handling that pauses the timer and audio capture without losing the prepared session.
- Auto-end the session when configured duration reaches zero.
- Persist final metrics once, and avoid duplicate completion updates on unmount.

### 4. Repair mock test create/start/session behavior

Update mock test flow component-by-component:

- `src/pages/app/mock-test/TestConfigure.tsx`
- `src/pages/app/mock-test/TestSession.tsx`
- `supabase/functions/create-test/index.ts`
- `supabase/functions/submit-test/index.ts` if needed after validation

Changes:

- Keep test creation as `DRAFT` and navigate to a pre-start screen/state.
- Do not automatically start the timer just because the user opened the test page.
- Start the test only when the user clicks Start, then set `IN_PROGRESS` and `started_at`.
- Add pause/resume UI for resumable tests if the test is still within its allowed time window.
- Auto-submit when time expires, with a single guarded submit call.
- Stabilize autosave so it does not recreate intervals every answer change.

### 5. Stabilize credits after paid actions

- Keep server-side deduction as the source of truth.
- After mock test creation, answer generation, and AI analysis, refresh the authenticated profile credit balance.
- Normalize client-side action names/costs so the UI matches the server-side deductions.
- Add user-facing credit failure messages where deductions fail, without charging twice.

### 6. Add focused regression tests

Add/extend tests around the fixed flows:

- Session detail renders without the `ChevronRight` crash.
- Live session lifecycle: create → start → pause → resume → auto-complete.
- Mock test lifecycle: create draft → start → autosave → submit/auto-submit.
- Credits: failed deduction blocks paid action; successful action refreshes balance.

### 7. Validation checklist

- Verify `/app/sessions/:id` no longer crashes.
- Verify a live session can be created before start, started, paused, resumed, and automatically ended at duration limit.
- Verify mock test creation, start, answer save, submit, and results navigation.
- Verify credits decrement once per paid action and displayed balance refreshes.
- Run targeted tests only; no broad refactor or unrelated feature rewrites.