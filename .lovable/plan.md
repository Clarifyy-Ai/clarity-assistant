
## Goal

Three things, in order:

1. **Overlay is the only UI on the Live page** (today both the `LiveRehearsal` 2‑panel page AND the floating overlay show at the same time). Overlay must be top‑most, hideable, and its buttons must work.
2. **Audit every sidebar feature + backend wiring** (edge functions, RPCs, RLS) and fix the broken connections that block production use.
3. **Read all `docs/*.md`** and produce a single, accurate audit/gap report so we stop chasing ghosts.

---

## What I found while exploring

### Problem 1 — Two live UIs render at once

`/app/live` route → `LiveRehearsal.tsx`. It renders **both**:
- A full 2‑panel page (Live Transcript + AI Answer) as the main view
- `<OverlayWindow />` floating on top via portal

That's why the user sees "overlay AND live interview panel both working". `LiveOverlay.tsx` (route `/app/live/overlay`) does it correctly — overlay only, with a small "Overlay Mode Active" centered hint.

There are also **two files named `OverlayWindow.tsx`**:
- `src/components/overlay/OverlayWindow.tsx` — the real, full overlay (486 lines)
- `src/components/live/OverlayWindow.tsx` — a stale 30‑line stub left over from a refactor

`MockSession.tsx` also mounts `OverlayWindow` alongside its own UI — same dual‑UI bug.

### Problem 2 — Overlay buttons not working / not visible properly

Likely causes confirmed by code reading:
- Overlay portal mounts into `#clarify-overlay-root` but `index.html`/`main.tsx` only ensures `#overlay-root` (different id) — console log confirms the warning fires every load: `#clarify-overlay-root not found in DOM — creating it dynamically`. It works, but the dynamic root is created with `pointer-events:none` and z‑index `9998`, and the children rely on `pointer-events:auto` cascading. On some pages this is fighting the page's own toolbar (LiveRehearsal header sits at z‑40, fine — but the `Toaster` and `MobileNav` can intercept clicks).
- Toolbar buttons depend on `onToggleMic`, `onToggleSystemAudio`, `onEndSession`, `onGenerate` props. On the `LiveOverlay` page those are wired; on `LiveRehearsal` `onGenerate` is **not passed** to `<OverlayWindow />` (line 124–130) — Get AI Answer is dead from the overlay.
- `OverlayQuickStart` only renders when `!isSessionActive && !lastSessionId && onStartSession`. On `LiveRehearsal` `onStartSession` isn't passed → if the session ever stops, the overlay shows nothing.
- `is_visible` defaults to false in `overlayStore`; `LiveRehearsal` never calls `showOverlay()` after start. `LiveOverlay` does (line 84).

### Problem 3 — Backend connection state

- `.env` is correct (Supabase URL/anon key resolved). Client init is healthy.
- Two parallel Supabase client wrappers exist (`@/integrations/supabase/client` and `@/lib/supabase/client`). They re‑export the same instance, so this isn't a bug — just confusing.
- 38 edge functions are deployed (`generate-answer`, `start-session`, `end-session`, `deepgram-token`, `parse-resume`, `process-stripe-webhook`, etc.). All live secrets exist (`GEMINI_API_KEY`, `DEEPGRAM_API_KEY`, `LOVABLE_API_KEY`, `OCR_API_KEY`, Stripe… not present).
- Sidebar links several pages whose backend isn't fully wired: **Practice Rooms** (`useRoom` hook exists but no edge function for room sessions visible), **Companies / Company Research** (function exists), **Interviews** (`schedule-interview` exists), **Referrals** (`lib/referrals.ts` reads/writes but no edge function), **Notifications** (`mark_notifications_read` RPC exists but no realtime subscription is wired).
- `process-stripe-webhook` and `stripe-webhook` both exist but **no Stripe secret is set** → all billing flows silently fail.
- Console shows `captureAndAnalyseCodingProblem` → `TypeError: Failed to fetch` — Gemini client is hitting a CDN URL instead of the edge function (`callGemini` in `geminiClient.ts:132`). Needs to route through `analyze-test-performance` / `generate-answer` edge functions.

---

## Plan

### Step 1 — Overlay is the only live UI

- Make `/app/live` (LiveRehearsal) **headless**: same logic for setup wizard + session start, but the active phase renders only `<OverlayWindow />` + `<ScreenCaptureBlocker />` + a small centered "Overlay Active" hint (mirror `LiveOverlay.tsx`). Remove the 2‑panel transcript/answer page UI.
- Pass **all** required props to `<OverlayWindow />` from LiveRehearsal: `onToggleMic`, `onToggleSystemAudio`, `onGenerate`, `onEndSession`, `onManualQuestion`, `onStartSession`, `onSetupNewSession`.
- Call `useOverlayStore.getState().showOverlay()` immediately when the active phase begins.
- Apply the same change to `MockSession.tsx`: keep its question stepper UI but **only when overlay is hidden**; default behavior is overlay‑first.
- Delete the stub `src/components/live/OverlayWindow.tsx` and update `src/components/live/index.ts` if it's exported.
- Collapse the `/app/live` and `/app/live/overlay` routes into one (`/app/live` → overlay experience). Keep `/app/live/overlay` as alias for back‑compat.

### Step 2 — Overlay visibility + button fixes

- `index.html`: add `<div id="clarify-overlay-root" style="position:fixed;inset:0;pointer-events:none;z-index:2147483647;isolation:isolate"></div>` next to `#overlay-root` so the dynamic creation warning goes away and z‑index is the topmost (`2147483647`, matching `OverlayPositionManager`).
- Update `main.tsx` `ensureOverlayRoot` to also seed `#clarify-overlay-root` (defensive).
- Remove the `pointer-events:none` from the overlay root (the panel manages its own pointer‑events; that style was making chrome behind the panel non‑clickable but also breaking some hit‑tests inside).
- Confirm `OverlayToolbar` actions actually call props (audit: Mic, System Audio, Generate, End, Stealth, Panic, Minimal, Auto‑gen, Hint style, Model). Add visible disabled tooltips when handlers are missing instead of silently noop.
- Add a guaranteed‑visible "Show Overlay" floating pill on the Live page when `is_visible === false`, so the user can always recover the overlay (replaces relying solely on Ctrl+Shift+H, which doesn't fire on some browsers).

### Step 3 — Sidebar feature audit + production wiring

For each sidebar entry, verify: route exists → page renders → page's data source resolves → write‑actions hit either RLS table or edge function → toasts on error. Fix the broken ones:

| Sidebar item | Issue I will fix |
|---|---|
| Live Co‑Pilot | Dual UI → overlay only (Step 1) |
| Mock Interview | `MockSession` dual UI → overlay‑first (Step 1) |
| Mock Tests (sub‑pages) | Confirm `select-test-questions`, `submit-test`, `analyze-test-performance` are reachable; add error toasts where they swallow failures |
| Call Sessions | `sessions/history` query — confirm RLS lets the user read; add empty state + retry |
| Analytics | Wire `analytics-dashboard` edge function to the page; today the page partially uses local mock data |
| Documents | Resume upload uses `parse-resume`; verify storage policies for `resumes` private bucket and surface upload errors |
| Answer Bank | CRUD against `session_answers`; add insert/update on save |
| Interviews | `schedule-interview` and `sync-calendar` exist but page doesn't call them; wire create + sync buttons |
| Companies | `company-research` edge function exists; page must call it on submit (currently uses placeholder) |
| Practice Rooms | `useRoom` is local‑only; gate this behind a "coming soon" badge until realtime channel + RLS table are added — do not pretend it works |
| Notifications | Subscribe to `notifications` realtime channel; call `mark_notifications_read` RPC on open |
| Settings → Billing | No Stripe secret. Show a clear "Stripe not configured — contact admin" banner instead of a silent failure. (Adding the secret is a user action.) |
| Admin Panel | Already implemented in last loops; verify routes still resolve with `requireAdmin` guard |

For each fix, add `toast.error(...)` on failure and skeleton/empty state on load so production users aren't staring at blank screens.

### Step 4 — Fix the Gemini "Failed to fetch" (console error)

`src/lib/ai/geminiClient.ts` is calling `https://cdn.gpteng.co/...` (sandbox proxy) for screenshot analysis, which doesn't work in production. Route screenshot analysis through a new `analyze-screenshot` thin edge function that wraps the existing `gemini.ts` shared util, OR re‑use `generate-answer` with an `image_data` payload. This unblocks "Analyze Screen" overlay button.

### Step 5 — Documentation audit

Read all 8 files in `docs/` and produce `docs/AUDIT_2026-05-01.md` containing:
- Verified working features (with the edge function / RPC each one calls)
- Stub/broken features (with the file + line where they fail)
- Missing secrets (Stripe)
- Recommended next sprint

I will NOT rewrite the existing docs in this loop — just add the audit file.

---

## Out of scope (will call out, not fix)

- Adding the Stripe secret (user must paste it).
- Building Practice Rooms backend (requires new tables + realtime — separate epic).
- Electron preload changes (current preload is minimal; desktop hardening is a separate task).
- Refactoring the two parallel Supabase client wrappers — both work, just cosmetic.

---

## Files I'll touch

```text
index.html                                       (add overlay root div)
src/main.tsx                                     (seed clarify-overlay-root)
src/pages/app/live/LiveRehearsal.tsx             (overlay-only)
src/pages/app/live/LiveOverlay.tsx               (small polish)
src/pages/app/mock/MockSession.tsx               (overlay-first)
src/components/live/OverlayWindow.tsx            (DELETE stub)
src/components/live/index.ts                     (drop stub export if present)
src/components/overlay/OverlayWindow.tsx         (always show after start)
src/components/overlay/OverlayToolbar.tsx        (disabled tooltips)
src/App.tsx                                      (route alias)
src/lib/ai/geminiClient.ts                       (route via edge function)
supabase/functions/analyze-screenshot/index.ts   (NEW thin function)
src/pages/app/Notifications.tsx                  (realtime + mark-read)
src/pages/app/interviews/NewInterview.tsx        (wire schedule-interview)
src/pages/app/company-research/CompanyResearch.tsx (wire company-research)
src/pages/app/Analytics.tsx                      (wire analytics-dashboard)
src/pages/app/rooms/PracticeRooms.tsx            ("coming soon" gate)
src/pages/app/settings/SettingsBilling.tsx       (Stripe-not-configured banner)
docs/AUDIT_2026-05-01.md                         (NEW gap report)
```

After approval I'll execute in this order: Step 1 (overlay unification) → Step 2 (visibility/buttons) → Step 4 (screenshot fix) → Step 3 (sidebar wiring) → Step 5 (audit doc).
