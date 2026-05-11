
# Clarify AI — Production Fix Plan

Eight fix tracks. Each lists the concrete code/DB/EF changes and the acceptance signal. Tracks are independent and can be shipped in order.

## 1. Unified Session Lifecycle (Live + Mock)

**Problem:** Duplicate sessions, "can't create" errors, no 24h reuse, no expiry.

**Changes:**
- `src/lib/session/sessionLifecycle.ts` — make `getOrCreateSession({ userId, type, config })` the single entry point.
  - Query: `sessions WHERE user_id=$1 AND type=$2 AND status IN ('active','pending') AND created_at > now() - interval '24h'` ordered by `created_at desc`, take first.
  - If found → return id, no insert.
  - Else insert `{ user_id, type, status: 'pending', title, started_at: null, created_at: now() }` and return id.
  - Wrap in try/catch returning `{ ok, sessionId, error }`.
- New helper `expireIfStale(sessionId)`: if `created_at < now()-24h` and status in `('pending','active')`, update to `abandoned` and return `{ expired: true }`.
- `src/pages/app/live/LiveOverlay.tsx`, `src/pages/app/mock/MockInterview.tsx`, `MockWarmup.tsx`, `MockSession.tsx` — replace ad-hoc inserts with `getOrCreateSession`. Add local `isStarting` ref + disabled Start button. Surface errors via `sonner` and keep user on setup screen.
- `useSessionOrchestrator` — call `expireIfStale` on mount; if expired, navigate back with toast "Session expired after 24 hours".
- Dashboard session list — render `status='abandoned'` rows with an "Expired" pill.

**Acceptance:** double-clicking Start creates 1 row; reopening within 24h reuses; >24h shows expired toast.

## 2. Overlay Stability

**Problem:** Transparent layer blocks clicks, dragging breaks layout, AI Help button dead.

**Changes:**
- `src/components/overlay/OverlayWindow.tsx`
  - Always-mounted container; toggle with `data-visible` attribute → CSS `opacity` + `pointer-events: none` when hidden.
  - Backdrop `<div>` gets `pointer-events:none` unless explicitly modal.
  - Remove any `onClick` on the root wrapper that hides the panel.
- Drag handle isolated to header bar (`data-drag-handle`); body inputs get `e.stopPropagation()` on pointerdown.
- Persist position to `profiles.overlay_position` (debounced 500ms) via `authStore.updateProfile`.
- Wire AI Help button → existing `useLiveCopilot.requestHint()`; show inline error on failure, keep overlay open.
- Fix z-index stack via existing `IndexManager`; ensure root z-index is below modals (currently `2147483647` — keep, but backdrop must not capture pointer events when hidden).

**Acceptance:** overlay hides without leaving an invisible mask; drag header works; AI Help triggers hint flow.

## 3. Mock Test AI Generation End-to-End

**Problem:** Manual creation broken; no AI generation EF; submit/analysis not wired.

**Changes:**
- New EF `supabase/functions/generate-mocktest/index.ts`
  - Input zod: `{ exam_name, exam_type, subjects[], difficulty, num_questions, time_limit_minutes }`.
  - Auth via `getClaims`.
  - Step 1: insert `mock_tests` row (`status='DRAFT'`, `config` JSON).
  - Step 2: select existing `questions` matching exam/subject/difficulty (limit N).
  - Step 3: if shortfall, call Lovable AI Gateway (`gemini-2.0-flash`) with structured prompt to fill gaps; insert into `questions` (`is_public=false`, `uploaded_by=user`).
  - Step 4: write `question_ids` array to `mock_tests`, set `status='READY'`.
  - On error set `status='FAILED'`, return 500 with message.
- `src/pages/app/mock/TestConfigure.tsx` — call EF via `fetchEdge`; on success navigate to ready screen; on fail show toast and keep form data.
- `TestSession.tsx` — guard against empty `question_ids`; insert `test_responses` per answer; on submit/timeout call existing `submit-test` EF which writes `test_analyses`.
- Add Free-plan monthly cap check (10/month) before insert per existing memory.

**Acceptance:** create test from UI → questions render → answers persist → analysis row created.

## 4. Dashboard Robustness

**Changes:**
- `src/pages/app/dashboard/Dashboard.tsx` — wrap each tile in `Promise.allSettled`; per-tile error fallback + skeleton + empty state.
- Replace any `select('*')` with explicit columns matched to `Tables<'sessions'|'mock_tests'|...>`.
- Remove dead column references; add console-quiet error boundary per tile.

**Acceptance:** loads with no console errors; broken tile doesn't kill the page.

## 5. Practice Rooms Create/Join/List

**Changes:**
- `src/pages/app/rooms/NewRoom.tsx` — insert into `practice_rooms` `{ host_id: auth.uid(), name, description, is_public, max_players, status: 'waiting' }`. On success navigate to room detail.
- `PracticeRooms.tsx` — list query filtered by `is_public=true OR host_id=me`; subscribe via Realtime channel `public:practice_rooms`.
- Join flow: insert into `room_participants` `{ room_id, user_id, role: 'participant' }`; transition `practice_rooms.status` to `'active'` when participant count ≥ 2 (via EF `join-practice-room` to keep RLS consistent).
- Surface errors with toasts; keep form data on failure.

**Acceptance:** create → row appears in list (own + realtime); join updates participants.

## 6. Companies Edge Functions

**Changes:**
- Audit `supabase/functions/company-research/index.ts` (and any `company-*` fns):
  - Use shared `_shared/cors.ts`.
  - Validate JWT with `getClaims`.
  - Use service client only for inserts; read with user-scoped client.
  - Map to actual `companies` / `company_research` columns (e.g. `raw_data` jsonb per memory).
  - Return JSON errors with `{ error }` and proper status; never leak stack traces.
- Frontend research page — show error UI + retry button on EF failure.

**Acceptance:** company research returns data or a friendly error; no 500 with stack in console.

## 7. Credits Purchase Flow (Stripe)

**Changes:**
- Confirm secrets configured: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SIGNING_SECRET`, `STRIPE_PRICE_*`. If missing, prompt user to add (the request itself is blocked until then).
- `create-checkout/index.ts` — verify it returns `{ url }` and includes `metadata.supabase_user_id` and a `credit_pack_id` for one-time credit purchases.
- `process-stripe-webhook/index.ts` — extend `checkout.session.completed`:
  - If session is one-time credit purchase, call `add_credits(p_user_id, p_amount, 'purchase', description, stripe_payment_id)`.
  - Idempotency: check `credit_transactions WHERE stripe_payment_id = session.payment_intent` before inserting.
- Frontend `BuyCredits.tsx` — on return from Stripe success URL, call `refreshProfile()` and show toast with new balance.

**Acceptance:** purchase → balance increments once, transaction row written, UI updates.

## 8. Onboarding & Settings Schema Alignment

**Changes:**
- Audit each onboarding step page: ensure `profiles` updates use only columns present in `types.ts` (`role_type`, `experience_years`, `target_role`, `target_companies`, `interview_date`, `audio_input_device`, `audio_output_device`, `noise_suppression`, `auto_transcript`, `overlay_*`, `preferred_model`, etc.).
- Final step sets `onboarding_completed=true`, `onboarding_step=5`.
- Add app-level guard in `ProtectedRoute` (already exists) — no change.
- `SettingsProfile/Notifications/Audio/Overlay` — use `TablesUpdate<'profiles'>` typed payloads; on save call `authStore.updateProfile` which patches DB and store.
- Remove any leftover `metadata` JSONB writes that don't match column.

**Acceptance:** new user completes 5 steps with no console errors; settings changes persist after reload.

## 9. Guide Versioning

**Changes:**
- `src/lib/constants/version.ts` — export `APP_VERSION` and `LAST_UPDATED` (ISO date). Bump in CI later.
- `src/pages/app/guide/Guide.tsx` (and marketing `Help.tsx`) — render header `Clarify AI · v{APP_VERSION} · Updated {LAST_UPDATED}`.

**Acceptance:** version + date visible at top of Guide.

---

## Cross-cutting

- All Supabase calls use `Tables<...>` / `TablesInsert<...>` / `TablesUpdate<...>` from `integrations/supabase/types.ts`.
- All EFs use `_shared/cors.ts` and return `Content-Type: application/json`.
- All paid actions deduct credits via `deduct_credits` RPC before AI call; refund via `refund_credits` on failure (existing pattern).
- Add toast on every async failure; never swallow errors.

## Order of execution

1. Track 1 (sessions) — unblocks Live + Mock entry
2. Track 2 (overlay) — unblocks Live usage
3. Track 8 (onboarding/settings) — unblocks new users
4. Track 3 (mock tests EF) — biggest functional gap
5. Track 7 (credits) — requires Stripe secrets
6. Track 5 (rooms), Track 6 (companies EF), Track 4 (dashboard), Track 9 (guide)

## Open prerequisites (need user input)

- **Stripe secrets**: confirm `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SIGNING_SECRET`, and price IDs are configured. If not, Track 7 will be blocked until they're added.
- **AI generation sources**: external scraping (Reddit/Testbook/Google) is not feasible from edge functions without API agreements; Track 3 will use `questions` bank + Gemini gap-filling only. Confirm acceptable.
