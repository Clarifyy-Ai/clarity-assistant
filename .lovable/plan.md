

# Production Fix Pass — Clarify AI (46 Issues)

This is a large-scope fix pass touching the overlay system, session flows, auth, edge functions, dashboard, audio, UI, and routing. Below is the implementation plan organized by file, grouped into batches.

---

## Batch 1: Overlay System (Issues 1–6)

### 1A. OverlayWindow visibility — CSS toggle instead of unmount (Issue 1)
**File**: `src/components/overlay/OverlayWindow.tsx`
- Remove the early return `if (!is_visible && !is_peek_active) return null`
- Always render the portal when `isMounted && overlayRoot` is truthy
- Wrap the inner content in a transition div: `opacity-0 pointer-events-none -translate-y-2` when hidden, `opacity-100 pointer-events-auto translate-y-0` when visible
- Add `transition-all duration-200` for smooth toggle
- Gate the conditional on `isSessionActive || is_visible || is_peek_active` — if no session is active AND not visible, we can still unmount safely

### 1B. Overlay position persisted in store (Issue 2)
**File**: `src/store/overlayStore.ts` — position already lives here ✅ (line 62, persisted via zustand/persist)
**File**: `src/components/overlay/OverlayPositionManager.tsx` — touch events already wired via `createTouchDragHandler` ✅
- No changes needed — position is already in the store and persisted. Touch events are already wired. The issue description assumed they weren't but the code shows they are.

### 1C. Overlay opacity/font from profile (Issue 3)
**File**: `src/store/authStore.ts` — after `loadProfile()`, seed overlay store
- In `loadProfile()` success branch, add:
  ```ts
  const overlay = useOverlayStore.getState();
  if (profile.overlay_opacity) overlay.setStealthOpacity(profile.overlay_opacity);
  // overlay_font_size is handled via CSS variable
  ```

### 1D. Hotkey race condition guard (Issue 4)
**File**: `src/pages/app/mock/MockSession.tsx` lines 84–92
- Guard the toggle handler: `if (phase !== "active") return;`

### 1E. Auto-generate hint race fix (Issue 5)
**File**: `src/pages/app/mock/MockSession.tsx` lines 100–110
- Pass question text directly to `handleRequestHint(qText)` instead of reading from store
- Modify `handleRequestHint` to accept an optional `questionText` parameter

### 1F. Z-index scale (Issue 6)
**File**: `tailwind.config.ts` — add z-index scale under `theme.extend.zIndex`:
```ts
zIndex: { overlay: "40", modal: "50", toast: "60" }
```
**File**: `src/components/overlay/OverlayPositionManager.tsx` — change `zIndex: 2147483647` → use a lower, consistent value
**File**: `src/components/ui/Modal.tsx` — ensure z-50 class

---

## Batch 2: Mock Session Fixes (Issues 7–12, 16)

### 2A. Mic permission check before Deepgram (Issue 7)
**File**: `src/pages/app/live/LiveRehearsal.tsx` (or wherever Deepgram connect is called)
- Add `navigator.mediaDevices.getUserMedia({ audio: true })` call before `deepgramClient.connect()`
- On rejection, show modal: "Microphone access is required"

### 2B. Generate questions in MockSession (Issue 8)
**File**: `src/pages/app/mock/MockSession.tsx` — in `handleSetup()` after `sessionsDB.create()`:
- Call `supabase.functions.invoke("generate-questions", { body: { ... } })`
- Set questions via `orchestrator.setQuestions(data.questions)`
- Show loading state during fetch

### 2C. Stale timer callback (Issue 9)
**File**: `src/pages/app/mock/MockSession.tsx`
- Store `handleEndSession` in `useRef` and update on every render
- Timer calls `handleEndSessionRef.current()`

### 2D. Double-end guard (Issue 10)
**File**: `src/pages/app/mock/MockSession.tsx`
- Add `endCalledRef = useRef(false)`, guard at top of `handleEndSession`

### 2E. session_answers population (Issue 11)
**File**: `src/pages/app/mock/MockSession.tsx`
- Add `answersRef = useRef<Array<{...}>>([])` 
- `captureAnswer()` function pushes current Q+A snapshot
- Call before `handleNextQuestion` and in `persistMockSession`
- Insert into `session_answers` table

### 2F. Navigation after completion (Issue 12)
**File**: `src/pages/app/mock/MockSession.tsx`
- After `orchestrator.completeSession()`, call `navigate(\`/app/sessions/${sessionId}\`)`

### 2G. Remove @ts-nocheck, fix imports (Issue 16)
**File**: `src/pages/app/mock/MockSession.tsx`
- Remove `@ts-nocheck` on line 1
- Fix `import { useAuthStore } from "@/store/userStore"` → `"@/store/authStore"`
- Type remaining `any` casts

---

## Batch 3: Auth & Security (Issues 13–15)

### 3A. OAuth navigate dead code (Issue 13)
**File**: `src/components/auth/OAuthButton.tsx` — line 138: `navigate("/app")` 
- Already mostly fixed. The code has a comment explaining redirect-mode makes this unreachable. Change `"/app"` to remove the navigate entirely in the success (non-error) branch, keeping only `onSuccess?.()`.

### 3B. Back-button vulnerability (Issue 14)
**File**: `src/components/layout/ProtectedRoute.tsx`
- Replace `<Spinner>` loading state with a blank `<div className="min-h-screen bg-background" />` — no content flash

### 3C. JWT refresh on tab resume (Issue 15)
**File**: `src/App.tsx` — add in root component or `AppShell`:
```ts
useEffect(() => {
  const handler = () => {
    if (document.visibilityState === 'visible') {
      supabase.auth.getSession();
    }
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}, []);
```

---

## Batch 4: Edge Functions (Issues 17–20)

### 4A. CORS origin whitelist (Issue 17)
**File**: `supabase/functions/_shared/cors.ts`
- `getCorsHeaders(req)` already exists and is used by 4 functions. The remaining 28 were migrated in the last pass.
- Add `ALLOWED_ORIGINS` env secret check: if set, validate origin against whitelist; if not set, fall back to `*`.
- This is a config-level fix — add `ALLOWED_ORIGINS` secret with value like `https://clarify-aii.lovable.app,https://id-preview--ff2f1c32-d4fd-4bbf-914d-d72bd2dd40a7.lovable.app`

### 4B. select-test-questions regex fix (Issue 18)
**File**: `supabase/functions/select-test-questions/index.ts`
- Fix `sanitizeText` regex from `[^\\\\w\\\\s...]` to `[^\\w\\s\\-.,()\\[\\]/ ]`
- Fix bearer regex from `^bearer\\\\s+` to `^bearer\\s+`

### 4C. Deepgram token refresh buffer (Issue 19)
**File**: `src/lib/audio/deepgramStream.ts` line 35
- Change `TOKEN_REFRESH_BUFFER_S = 10` → `TOKEN_REFRESH_BUFFER_S = 50`
- With 60s TTL, this means tokens are refreshed if >10s old (effectively always on reconnect)

### 4D. generate-questions timeout (Issue 20)
**File**: `supabase/functions/generate-questions/index.ts`
- Add `AbortController` with 22s timeout to Gemini API call
- On timeout, return 503 with user-friendly message

---

## Batch 5: Dashboard Fixes (Issues 21–24)

### 5A. Session count flicker (Issue 22)
**File**: `src/pages/app/Dashboard.tsx` line 140
- Change `useState<number>(0)` → `useState<number | null>(null)`
- In StatCard: show `"—"` when null

### 5B. XP division by zero (Issue 23)
**File**: `src/pages/app/Dashboard.tsx` line 521
- Change `gamification.level * XP_PER_LEVEL` → `Math.max(gamification.level * XP_PER_LEVEL, 1)`

### 5C. EmptyState window.location.href → navigate (Issue 33, related)
**File**: `src/pages/app/Dashboard.tsx` lines 400, 482
- Replace `window.location.href = "/app/mock"` with navigate calls
- Lift `useNavigate()` into RecentSessions and UpcomingInterviews sub-components

### 5D. Error handling on queries (Issue 36)
**File**: `src/pages/app/Dashboard.tsx`
- Add `if (error) toast.error(...)` in session count query (line 148)
- Already done in RecentSessions (line 370) ✅

---

## Batch 6: Screen Capture & Stealth (Issues 25–26)

Already implemented:
- `screenCaptureEvasion.ts` already has `enableContentProtection()`, `patchGetDisplayMedia()`, `getSupportInfo()` with full/partial/none levels ✅
- `ScreenCaptureBlocker.tsx` already has `WarningBanner` with emerald/amber/red variants ✅
- No changes needed — issues 25 and 26 describe problems that have already been fixed in the current codebase.

---

## Batch 7: Responsiveness (Issues 27–30)

### 7A. Mobile overlay bottom sheet (Issue 27)
**File**: `src/components/overlay/OverlayWindow.tsx`
- Add `useMediaQuery('(max-width: 767px)')` check
- On mobile: render as fixed bottom sheet instead of floating window
- Increase button tap targets to ≥44px

### 7B. MockSession overflow on 320px (Issue 28)
**File**: `src/pages/app/mock/MockSession.tsx`
- Add `max-h-screen overflow-y-auto` to outer container
- Reduce padding `p-3` on mobile

### 7C. Quick Actions overflow (Issue 29)
**File**: `src/pages/app/Dashboard.tsx` — Quick Actions grid
- Add `p-2` on xs screens, `truncate` on labels

### 7D. SetupChecklist overflow (Issue 30)
**File**: `src/components/layout/SetupChecklist.tsx`
- Add `overflow-y-auto max-h-96` to checklist container

---

## Batch 8: Navigation & Routing (Issues 31–33)

### 8A. Auth guard memoization (Issue 31)
**File**: `src/components/layout/ProtectedRoute.tsx`
- Wrap with `React.memo` — the component already only re-renders when auth state changes, but memo prevents outlet re-evaluation

### 8B. /app/interview-day route (Issue 32)
- Route already exists in App.tsx line 357 ✅: `{ path: "interview-day", element: <Page component={InterviewDay} /> }`
- No fix needed.

### 8C. EmptyState navigate fix (Issue 33)
- Covered in Batch 5C above

---

## Batch 9: Audio & Diarization (Issues 34–35)

### 9A. Filler word parsing from Deepgram (Issue 35)
**File**: `src/lib/audio/deepgramStream.ts`
- Already has `type?: "word" | "filler" | "punctuation"` on DeepgramWord (line 66) ✅
- Already counts fillers in utterance parsing ✅
- No changes needed — this was fixed in a prior round.

### 9B. Diarization simplification (Issue 34)
**File**: `src/lib/audio/diarization.ts`
- Simplify `classifySpeaker()` to trust Deepgram output directly
- Remove dead heuristic code

---

## Batch 10: Error Handling (Issues 36–38)

### 10A. Silent API failures (Issue 36)
- Dashboard already handles errors ✅ (line 370)
- Add error handling to session count query and any remaining unguarded queries

### 10B. Edge function error leaks (Issue 37)
- Audit all catch blocks in edge functions
- Remove `detail: String(err)` — return only `{ error: "Internal server error" }`
- Apply to: `generate-questions`, `generate-hint`, `generate-answer`, `ai-coach-chat`, etc.

### 10C. Retry UI for failed session start (Issue 38)
**File**: `src/pages/app/mock/MockSession.tsx`
- Keep `sessionConfigRef.current` on error (already done — line 175 returns early without clearing)
- Pre-populate setup form with previous config

---

## Batch 11: Performance (Issues 39–41)

### 11A. Dashboard parallel queries (Issue 39)
**File**: `src/pages/app/Dashboard.tsx`
- Create `useDashboardData()` hook that runs all queries via `Promise.all()`
- Single loading state

### 11B. Database indexes (Issue 40)
- Create migration adding:
  - `CREATE INDEX idx_sessions_user_created ON sessions(user_id, created_at DESC)`
  - `CREATE INDEX idx_session_answers_session ON session_answers(session_id)`
  - `CREATE INDEX idx_session_transcripts_session ON session_transcripts(session_id)`

### 11C. Explicit column lists (Issue 41)
- Audit document queries — replace `SELECT *` with explicit columns excluding `content`

---

## Batch 12: Polish (Issues 42–46)

### 12A. Timer "Saving..." text (Issue 42)
**File**: `src/pages/app/mock/MockSession.tsx` — timer display
- When `sessionTimeLeft <= 0`, show "Saving..." instead of "0:00"

### 12B. Filler word typography (Issue 43)
**File**: `src/pages/app/mock/MockSession.tsx` line 415
- Change `x{count}` → `×{count}` (use `×`)

### 12C. Skip marks answer as skipped (Issue 44)
- In skip handler, call `captureAnswer(true)` with `skipped: true`

### 12D. WPM color fix (Issue 45)
**File**: `src/pages/app/mock/MockSession.tsx` line 383
- Change `text-blue-400` → `text-amber-400` for slow speakers (<80 WPM)
- Add tooltip

### 12E. Credits refresh after session (Issue 46)
**File**: `src/pages/app/mock/MockSession.tsx`
- After `persistMockSession()`, call `useAuthStore.getState().refreshCredits()`

---

## Summary

| Batch | Issues | Files Modified | Priority |
|-------|--------|---------------|----------|
| 1. Overlay | 1–6 | OverlayWindow, overlayStore, authStore, tailwind.config | 🔴 P0 |
| 2. MockSession | 7–12, 16 | MockSession.tsx | 🔴 P0 |
| 3. Auth | 13–15 | OAuthButton, ProtectedRoute, App.tsx | 🟠 P1 |
| 4. Edge Functions | 17–20 | cors.ts, select-test-questions, deepgramStream, generate-questions | 🟠 P1 |
| 5. Dashboard | 21–24, 33 | Dashboard.tsx | 🟠 P1 |
| 6. Screen Capture | 25–26 | Already fixed ✅ | — |
| 7. Responsiveness | 27–30 | OverlayWindow, MockSession, Dashboard, SetupChecklist | 🟡 P2 |
| 8. Navigation | 31–33 | ProtectedRoute, Dashboard | 🟡 P2 |
| 9. Audio | 34–35 | diarization.ts (35 already fixed) | 🟡 P2 |
| 10. Error Handling | 36–38 | Dashboard, edge functions, MockSession | 🟡 P2 |
| 11. Performance | 39–41 | Dashboard, migration | 🟢 P3 |
| 12. Polish | 42–46 | MockSession | 🟢 P3 |

**Estimated files to modify**: ~15 source files + 3 edge functions + 1 migration
**Already fixed (no action)**: Issues 2 (position), 25–26 (screen capture), 32 (route exists), 34–35 (audio)

