

The user has provided a thorough third-party audit with specific findings. I need to plan a targeted fix pass for the actionable items. Let me categorize:

**🔴 Critical (must fix):**
1. Electron `sandbox: false` → `sandbox: true`
2. `apiClient.ts` calling `supabase.auth.getSession()` on every request → read from authStore first

**🟡 Important:**
3. `generate-answer` credit deduction before Gemini call → refund on failure (or deduct after)
4. PostHog `identify()` not called on returning sessions
5. Zod validation in `generate-answer` (skip — adds dependency, current slice() is acceptable defensive)

**🟢 Nice-to-have:**
6. Remove `console.warn` monkey-patch in `App.tsx`, use proper router future flags
7. Drag region overlap check in `App.tsx`
8. authStore listener cleanup (memory leak in dev hot-reload)
9. `extractErrorMessage` string fallback in apiClient
10. `ensureOverlayRoot` IIFE → put in index.html

Let me verify a few claims by reading the actual files before planning.

Plan structure:
- Phase 1: Critical security/perf (Electron sandbox, apiClient token caching)
- Phase 2: Important reliability (credit refund saga, PostHog identify on resume, listener cleanup)
- Phase 3: Polish (router warnings, drag region, overlay root in HTML, error message fallback)

Skip Zod (heavy dep for marginal gain — current slice() bounds are adequate defensive coding).

# Targeted Fix Pass — Third-Party Audit Findings

Acting on the audit's specific, verifiable findings. Skipping Zod (heavyweight dep for marginal gain over existing `String().slice()` bounds) and the "drag region malware flagging" item (subjective UX advice, not a bug).

## Phase 1 — Critical

**1. Electron sandbox** (`electron/main.cjs`)
- Change `sandbox: false` → `sandbox: true`. `contextIsolation: true` is already set, so the IPC bridge keeps working.
- Acceptance: app launches, tray + overlay still functional, IPC events fire.

**2. apiClient token caching** (`src/lib/network/apiClient.ts` + `src/lib/network/fetchEdge.ts`)
- Replace `await supabase.auth.getSession()` with: read `useAuthStore.getState().session?.access_token` first; only fall back to `supabase.auth.getSession()` if the store has no token.
- Same change in `fetchEdge.ts` `getAuthHeaders()`.
- Acceptance: 5 parallel API calls trigger 0 IndexedDB reads when authenticated.

## Phase 2 — Important

**3. Credit deduction saga** (`supabase/functions/generate-answer/index.ts`)
- Wrap the Gemini fetch in try/catch. On any failure after `deductCredits()` succeeds, call the existing `refund_credits` RPC to restore the 2 credits.
- Inside the SSE `ReadableStream` `start()`, also catch stream-mid failures and trigger refund (via a separate edge call or a shared helper — simplest: refund only on pre-stream Gemini errors; mid-stream failures already returned partial value).
- Acceptance: simulate Gemini 503 → user credits unchanged after request.

**4. PostHog identify on resume** (`src/store/authStore.ts`)
- In `initialize()`, after the existing-session branch sets `s.session = session`, also call `posthog.identify(session.user.id, { email })` if PostHog is loaded.
- Acceptance: refresh page while logged in → PostHog session has `distinct_id = user.id`.

**5. authStore listener cleanup** (`src/store/authStore.ts`)
- Before assigning `_unsubAuthListener`, check if one already exists and call `.unsubscribe()` on it. Prevents duplicate listeners during HMR.
- Acceptance: trigger HMR 5 times → only one auth listener fires per event.

## Phase 3 — Polish

**6. Remove `console.warn` monkey-patch** (`src/App.tsx`)
- Delete the override block. Add `future: { v7_startTransition: true, v7_relativeSplatPath: true }` to `createBrowserRouter` options.
- Note: project memory says `v7_startTransition` causes "Cannot update component during render" loops — verify by reading the memory note before applying. If it conflicts, keep the override but scope it to only suppress the specific Router warning string instead of all `console.warn`.

**7. apiClient error message fallback** (`src/lib/network/apiClient.ts`)
- In `extractErrorMessage`, add `if (typeof error === "string") return error;` before the generic fallback.

**8. Overlay root in HTML** (`index.html` + `src/main.tsx`)
- Confirm `<div id="overlay-root"></div>` exists in `index.html` (memory says it does). If present, simplify the `ensureOverlayRoot` IIFE in `main.tsx` to just an idempotent guard (keep as defensive belt-and-braces but skip the createElement call when found).

## Out of scope / declined

- **Zod validation in edge functions**: existing `String(x).slice(N)` is sufficient defensive bounding. Adding Zod = +30KB cold start, marginal benefit.
- **Drag region overlap**: subjective UX, no concrete bug reproduced.
- **vendor-ui chunk splitting**: premature optimization without measured bundle bloat.
- **Malware-flagging concerns** (alwaysOnTop + contentProtection + skipTaskbar): these are intentional product features (stealth overlay) — Tray quit menu already exists.

## Files to edit

| File | Change |
|------|--------|
| `electron/main.cjs` | `sandbox: true` |
| `src/lib/network/apiClient.ts` | Token from store + string error fallback |
| `src/lib/network/fetchEdge.ts` | Token from store |
| `supabase/functions/generate-answer/index.ts` | Refund on Gemini failure |
| `src/store/authStore.ts` | PostHog identify on resume + listener cleanup |
| `src/App.tsx` | Router future flags (conditional on memory check) |
| `src/main.tsx` | Simplify `ensureOverlayRoot` |

