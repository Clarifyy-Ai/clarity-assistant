## What's Broken (Audit Findings)

I inspected the auth flow, admin gating, overlay chat, and the `generate-answer` edge function. Here's what's actually causing each issue — without changing any working features yet.

### 1. Admin login / can't access admin

- Network logs confirm: login succeeds, profile loads, `user_roles` returns `[{role:"admin"}]`, `isAdmin` is set to `true` in `authStore`. So the role IS correct.
- But `ProtectedRoute` shows the `idle/loading` blank screen until `status` flips. If `loadProfile()` runs *after* `status` becomes `authenticated` (race), the first admin route render uses stale `isAdmin=false` → "Access Denied" card, requiring a refresh.
- Fix: gate `requireAdmin` on `isProfileLoaded` (already in store) before deciding access; show loader while profile is still loading.

### 2. Deepgram not working

- `DEEPGRAM_API_KEY` is set, but the `deepgram-token` edge function **also requires `DEEPGRAM_PROJECT_ID`** to mint scoped tokens. That secret is missing → function returns 503 "Transcription service misconfigured" → live transcription never connects.
- Fix: add the `DEEPGRAM_PROJECT_ID` secret. (No code change needed.)

### 3. Gemini AI answer generator not working

- `generate-answer` streams SSE back. The client (`useLiveCopilot.requestFullAnswer`) calls `supabase.functions.invoke("generate-answer", ...)`. **`functions.invoke` buffers the entire response and does not stream** — and for `text/event-stream`, it can return either a `Blob`/`ReadableStream`, not the plain string the parser expects. So no chunks ever land in the overlay.
- Secondary bug: the edge function's refund path calls `db.rpc("refund_credits", { p_user_id, p_amount, p_reason })` but the DB function signature is `refund_credits(p_cost integer)` — refunds will throw on every Gemini failure.
- Fix:
  - Replace `supabase.functions.invoke` with a direct `fetch` to the function URL with the user JWT, then read the response body with a streaming reader (already used in other places).
  - Update the `refund_credits` RPC call in the edge function to match the existing signature (`p_cost`).

### 4. Overlay chat panel — manual messages do nothing

- `OverlayChatPanel` → `OverlayChatInput` calls `onSubmit(question)`. In `LiveOverlay.tsx` this is wired to `copilot.requestLiveHint(question)` only — the user's message is **never appended to `chat_history`**, and no assistant reply is appended either. So typing a message produces zero visible feedback.
- Fix:
  - On submit: push a `{role:"user", text}` message into `overlayStore.chat_history`, set `is_chat_generating=true`, then call the answer generator (same one as #3) and append the result as `{role:"assistant", text}`.

### 5. Other "many features not working"

I'll only touch what's listed above this round (per your guardrail: component-by-component, don't touch working features). If you can name any other specific feature that's broken, I'll add it as a separate pass.

---

## Implementation Plan (component-by-component)

**Pass A — Secrets** (no code)
- Prompt for `DEEPGRAM_PROJECT_ID` so the token endpoint can mint scoped keys.

**Pass B — Admin gate race** (`src/components/layout/ProtectedRoute.tsx`)
- When `requireAdmin`, also wait for `isProfileLoaded`. Show the same loading shell instead of the access-denied card while profile is still hydrating.
- Guardrail: do not change non-admin routes' behavior.

**Pass C — generate-answer streaming** (`src/hooks/useLiveCopilot.ts` + `supabase/functions/generate-answer/index.ts`)
- Client: switch `requestFullAnswer` to a direct `fetch` against `${VITE_SUPABASE_URL}/functions/v1/generate-answer` with `Authorization: Bearer <session.access_token>` and `apikey: <anon>`, then stream the SSE body via `ReadableStream` reader and `appendStreamChunk` per chunk.
- Edge fn: fix `refund_credits` RPC params (`{ p_cost: COST }`), keep all auth/CORS exactly as-is.
- Guardrail: do not alter request body shape, credit cost, or prompt.

**Pass D — Overlay chat manual send** (`src/pages/app/live/LiveOverlay.tsx` + `src/store/overlayStore.ts` if missing helpers)
- Add an `appendChat(role, text)` helper if not already there.
- Replace the simple `requestLiveHint(question)` wiring with: append user msg → set generating → call the same streaming answer flow (Pass C) → append final text as assistant msg → clear generating.
- Guardrail: don't touch auto-detected question handling (`handleQuestionDetected`) or hint panel logic.

**Pass E — Smoke verify**
- Reload, sign in as admin → admin dashboard renders without "Access Denied".
- Start a live overlay → Deepgram WS connects (token endpoint returns 200).
- Type a question in the overlay chat → user bubble appears, streaming answer appears.

I will NOT modify: mock test flow, payments, onboarding, sessions lifecycle, RLS, or anything else outside the four files listed.
