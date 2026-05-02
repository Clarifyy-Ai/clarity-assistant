# Production Connectivity Pass — Overlay, Calendar Sync & Audit Fixes

This plan delivers three things in one pass:
1. **Verify** every overlay button works against a real session.
2. **Wire** Google Calendar sync into the Interviews flow (it already exists in `useCalendarSync` but is unused there).
3. **Fix** the connectivity gaps a full file-by-file audit surfaced (NewInterview ↔ scheduler signature mismatch, Analytics not using its edge function, Notifications missing realtime, Practice Rooms stub state, missing toasts on silent failures).

No schema changes — all backend pieces (edge functions, tables, RPCs) already exist; the work is wiring + UX hardening.

---

## 1. Overlay button verification & hardening

Current state (`OverlayWindow` → `OverlayToolbar`): all 7 props (`onToggleMic`, `onToggleSystemAudio`, `onGenerate`, `onEndSession`, `onManualQuestion`, `onStartSession`, `onSetupNewSession`) are passed by `LiveRehearsal.tsx`. Stealth, Panic, hint-style, model picker, screenshot, and chat all dispatch to `useOverlayStore` / `toggleAppStealthMode` / `captureAndAnalyseCodingProblem` directly.

**Audit findings to fix:**

| Button | Current behavior | Fix |
|---|---|---|
| Mic toggle | `audio.toggleMute()` | OK — verify via toast on success/failure |
| System Audio | `audio.toggleSystemAudio()` | Wrap in try/catch, surface `getDisplayMedia` rejection as toast (currently silent on Safari/FF) |
| AI Help (Generate) | `handleGenerate` shows `toast.info` if no question | OK |
| End | `handleStop` → `endLiveSession` | OK |
| Stealth (More menu) | `toggleAppStealthMode()` | OK |
| Panic (More menu + Ctrl+Shift+P) | `showPanic(PANIC_RESPONSE)` | OK |
| Setup New Session | `() => setPhase("setup")` | OK |
| Screen capture | `captureAndAnalyseCodingProblem()` | Add toast for permission denial |
| Minimal toggle | direct store call | OK |

**Implementation:**
- Add a small `safeToast` wrapper around the two browser-permission paths (system audio + screen capture) in `OverlayToolbar.tsx`.
- Add a manual smoke-test checklist to `docs/AUDIT_2026-05-01.md` with one row per button and the expected store/audio side-effect, so future regressions are catchable in 60 seconds.

---

## 2. Calendar sync wiring (Interviews ↔ Google Calendar)

Today: `useCalendarSync` works (it talks to `sync-calendar` and `disconnect-calendar` edge functions), but it is only consumed by `SettingsIntegrations.tsx`. The Interviews flow never triggers a sync, so newly-scheduled interviews don't push to calendar and Google events don't pull into the tracker.

**Bug discovered:** `NewInterview.tsx` calls `scheduler.createInterview({ company_name, role_title, interview_type, platform, scheduled_at, duration_minutes, round_number, interviewer_name, meeting_link, notes })`, but `InterviewFormValues` requires `stage` and `priority` and does not accept the round-level fields. The insert silently strips them and the round is never created. This is why the previously reported "Interviews — Partial" status appears as broken in the UI.

**Fix plan:**

1. **Repair NewInterview ↔ scheduler contract** — split the form payload so the parent `scheduled_interviews` row gets the right shape (`stage: "applied"`, `priority`), and `addRound()` is called with the round-level fields right after creation. One scheduler call, two DB inserts.
2. **Add a "Sync to Google Calendar" CTA** to `Interviews.tsx` toolbar:
   - If `isConnected === false`, button label is "Connect Calendar" → `connectGoogle()`.
   - If connected, "Sync now" → `syncNow()` with a toast showing imported count.
   - Show `lastSynced` timestamp under the button.
3. **Auto-sync hook on create:** after a successful `createInterview` in `NewInterview.tsx`, if `isConnected`, fire `syncNow()` (best-effort, don't block navigation).
4. Surface `useCalendarSync.error` via `sonner` toast in both pages (currently silent).

No edge function changes needed — `sync-calendar` and `schedule-interview` already exist. No new tables.

---

## 3. Cross-feature audit fixes (P1 from `AUDIT_2026-05-01.md`)

### 3a. Analytics page → wire `analytics-dashboard` edge function
`src/pages/app/Analytics.tsx` reads everything from the local `useAnalytics` hook (client-side aggregation over `sessions`). The `analytics-dashboard` edge function returns server-aggregated KPIs (cheaper, accurate over 1000-row Supabase limit).

- Update `useAnalytics.ts` to invoke `analytics-dashboard` first; fall back to the existing local aggregation only if the function errors.
- Keep the same return shape so `Analytics.tsx` is untouched.

### 3b. Notifications realtime
`Notifications.tsx` reads from `notifications` table directly; `notificationStore` has no Postgres realtime channel, so unread badge in `AppTopBar` is stale until a hard refresh.

- Add a single `supabase.channel("notifications:" + userId).on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: \`user_id=eq.\${userId}\` }, ...)` subscription inside `notificationStore.init()`.
- Switch the "mark all read" handler to call the existing `mark_notifications_read(p_user_id)` RPC (already in the DB, currently unused).

### 3c. Practice Rooms — gate behind "Coming soon"
`useRoom` is local-only with no realtime/`rooms` write path despite the table existing. Rather than ship half-working multiplayer, gate the route:
- `PracticeRooms.tsx` shows a "Coming soon" empty state with a waitlist CTA (writes to `feedback` table with `category: "rooms_waitlist"`).
- Hide the sidebar item behind a `FEATURE_FLAGS.rooms` check so we can flip it back on once realtime lands.

### 3d. Silent-failure toasts
- `CompanyResearch.tsx`: wrap `company-research` invoke in try/catch, toast on error.
- `NewInterview.tsx`: already shows `error` text, but also fire a `toast.error()`.

### 3e. Stripe missing-secret banner
Detect missing Stripe config (catch 500 from `create-checkout`) and show a one-line banner in `BillingSettings` instead of a generic error: "Billing not yet configured. Add `STRIPE_SECRET_KEY` to enable upgrades."

---

## 4. Documentation refresh

- Update `docs/AUDIT_2026-05-01.md`: move Interviews / Analytics / Notifications from **Partial** → **OK**, mark Rooms as **Coming Soon**.
- Update `docs/ARCHITECTURE.md`: replace the 2-panel Live UI section with the overlay-only flow.
- Sync `docs/API.md` edge-function count (32 → 38) and add the calendar-sync sequence diagram.

---

## Files touched

```text
src/components/overlay/OverlayToolbar.tsx        (safe toasts)
src/pages/app/live/LiveRehearsal.tsx             (verify, no behavior change)
src/pages/app/interviews/NewInterview.tsx        (fix scheduler contract + auto-sync)
src/pages/app/interviews/Interviews.tsx          (Connect/Sync CTA)
src/hooks/useInterviewScheduler.ts               (split parent + round inserts)
src/hooks/useCalendarSync.ts                     (no change — already correct)
src/hooks/useAnalytics.ts                        (call analytics-dashboard first)
src/store/notificationStore.ts                   (realtime channel + RPC mark-read)
src/pages/app/rooms/PracticeRooms.tsx            (Coming soon state)
src/pages/app/company-research/*.tsx             (toast on error)
src/components/billing/UpgradeModal.tsx          (Stripe-missing banner)
docs/AUDIT_2026-05-01.md, ARCHITECTURE.md, API.md (refresh)
```

No SQL migrations. No new edge functions. No new secrets required.

---

## Out of scope (next sprint)

- Stripe activation (waiting for `STRIPE_SECRET_KEY` from user).
- Real Practice Rooms multiplayer (requires WebRTC + realtime channel design).
- Replacing the 845 TODO test placeholders.
