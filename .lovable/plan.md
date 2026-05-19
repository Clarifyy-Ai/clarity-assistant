# Fix Plan — 7 Issues

Guardrail: changes are scoped to the listed areas. Working features (auth hydration, RLS, session orchestration) are not touched.

## 1. Unified overlay (Mock layout reused by Live)
- `src/pages/app/live/LiveOverlay.tsx`: replace its bespoke `<OverlayWindow>` children/props block with the same composition `MockSession.tsx` uses (same tabs, header, toolbar, chat panel, hint panel, question bar).
- Keep live-only wiring: panic button, system-audio capture status, `LiveNetworkMonitor`, mic mute — slot them into the Mock layout's existing toolbar/badge area (no new screens).
- Delete duplicate stealth/proctor blocks already handled inside `OverlayWindow` to avoid double mounts.
- `LiveRehearsal.tsx`: same overlay composition for consistency.

## 2. Deepgram — surface real errors
- `supabase/functions/deepgram-token/index.ts`: return `{ error, code, hint }` JSON with the upstream Deepgram status text instead of generic 500.
- `src/lib/audio/deepgramStream.ts`: when token fetch fails, propagate the JSON `error` + `hint` to `onError` (today it swallows into a generic "No Deepgram token available").
- On WS `close` with non-1000 code, emit `onError(new Error(`Deepgram WS ${code}: ${reason}`))` and toast via the live controller.

## 3. Chat history + input
- `OverlayChatInput.tsx`: confirm submit handler calls `addChatMessage` and resets input; fix the disabled-state guard (`is_chat_generating` blocks typing — should only block send).
- Persist `chat_history` by adding it to the existing `persist` partialize in `overlayStore.ts` (keyed per `session_id`) so history survives panel toggles/refresh during a session.
- `OverlayChatPanel.tsx`: stop clearing history on tab switch (the reset is currently triggered by an effect on tab change — remove it).

## 4. Admin login routing
- `src/pages/auth/Login.tsx`: after `signIn`, await `authStore.loadProfile()` (already triggered) and then branch:
  - `if (isAdmin) navigate('/app/admin')` else `navigate(from || '/app/dashboard')`.
- `ProtectedRoute`/`AdminLayout` already use `has_role()` via `user_roles` — no DB change.
- Verify the logged-in admin actually has a row in `public.user_roles` (`role='admin'`). If missing, surface a one-time SQL snippet to the user.

## 5. Mock test creation
- `supabase/functions/create-test/index.ts`: current code rejects with 400 when `question_ids` is empty. Wizard sends a config without ids and expects server to select via `select-test-questions`. Fix by: if `question_ids` empty, call `select-test-questions` logic inline (or invoke it) using `config.subjects + difficulty_distribution + count` to populate `question_ids` before insert.
- Frontend `TestConfigure.tsx`: ensure it sends `config.count` and `config.subjects`; show edge-function error body in toast instead of generic "failed".

## 6. Debrief
- `generate-debrief`: works only when `session_answers` exist. Add a fallback: if no answers but `sessions.transcript` is present, build prompt from transcript so debrief still generates.
- Frontend `Debrief.tsx`: pass `session_id` (UUID), surface server error text.
- Verify `session_debriefs` insert columns match parsed schema (drop unknown keys to avoid PG error).

## 7. Analytics page
- `src/pages/app/Analytics.tsx` + `analytics-dashboard` edge function: ensure function returns 200 with zeroed payload when user has no sessions (current code likely throws on empty aggregates). Add `coalesce` defaults server-side and a friendly EmptyState client-side.

## Verification
- After edits: deploy edge functions, run `supabase--curl_edge_functions` against `create-test`, `generate-debrief`, `analytics-dashboard`, `deepgram-token` with the preview session token.
- Manual: login as admin → expect `/app/admin`; open Live overlay → expect Mock layout; send chat → message persists; create mock test with no manual ids → succeeds.

## Out of scope
No schema migrations, no auth flow changes, no styling redesign beyond reusing the existing Mock overlay composition.
