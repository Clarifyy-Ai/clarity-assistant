# Fix Remaining Production Bugs (Areas 3–8 + Companies + Guide)

Areas 1 (Mock/Live session creation) and 2 (Overlay stability) are already done. This plan covers the remaining checklist items end-to-end.

## 3. Mock Tests + AI Generation

**New Edge Function: `generate-mocktest`**
- Inputs: `exam_name, exam_type, subjects[], difficulty, num_questions, time_limit_minutes`.
- JWT-auth via `_shared/utils.ts`; uses service client.
- Flow:
  1. Insert `mock_tests` row (`status='DRAFT'`, config JSON, `time_limit_minutes`, empty `question_ids`).
  2. Try to fetch existing `questions` matching subject/exam/difficulty (random sample up to N).
  3. If gap remains, call Gemini (`gemini-2.0-flash` via `LOVABLE_API_KEY`) to generate MCQs with `question_text, options[4], correct_answer, explanation, subject, topic, difficulty`. Insert into `questions` (`uploaded_by=user, is_public=false, is_verified=false`).
  4. Update `mock_tests.question_ids` (uuid[]) and set `status='READY'`.
  5. On any failure, mark `status='FAILED'` and return `{ error }`.
- Returns `{ test_id, question_count }`.

**Frontend wiring (`src/pages/app/mock-tests/`)**
- `MockTestSetup.tsx`: `handleCreate` → `supabase.functions.invoke('generate-mocktest', { body })`. Disable button while pending; toast on error; preserve form state.
- After success, navigate to `/app/mock-tests/:testId/start`.
- `MockTestSession.tsx`: validate `question_ids.length > 0` before render; otherwise show "Generation failed — Re-generate" CTA.
- On answer: insert `test_responses` row. On submit/timeout: upsert `test_analyses` (accuracy, total_score, subject_breakdown).

## 4. Dashboard + Practice Rooms

**Dashboard (`src/pages/app/Dashboard.tsx`)**
- Replace any sequential queries with `Promise.all` for: `sessions` (last 5), `mock_tests` (last 5), `profiles.credits`, `interviews` upcoming, `user_badges`.
- Wrap each in try/catch returning `null` so one failure doesn't blank the page.
- Add explicit empty-state cards (no infinite spinners). Use `Tables<'sessions'>` etc.

**Practice Rooms (`src/pages/app/rooms/CreateRoom.tsx`, `RoomsList.tsx`, `useRoom.ts`)**
- `createRoom`:
  ```ts
  const { data: room } = await supabase.from('practice_rooms').insert({
    host_id: user.id, name, description, is_public, max_players, status: 'waiting'
  }).select().single();
  await supabase.from('room_participants').insert({ room_id: room.id, user_id: user.id, role: 'host' });
  ```
- Disable submit while pending; toast errors; navigate to `/app/rooms/:id` on success.
- `RoomsList`: query `practice_rooms` where `is_public=true OR host_id=auth.uid()`, order by `created_at desc`.
- Join flow: insert `room_participants` row (idempotent on `(room_id,user_id)`).

## 5. Companies Edge Functions

Audit each EF in `supabase/functions/` matching `company-*`:
- Use `_shared/cors.ts` (already centralized) — remove any local wildcard headers.
- Use `_shared/utils.ts` `requireAuth()` for JWT.
- Map to correct columns: `company_research.raw_data` (jsonb), not `data`. `companies.tech_stack/values` arrays.
- Wrap Gemini calls in try/catch; return `{ error: 'Research failed', detail }` with status 500 (no stack traces).
- Frontend `CompanyResearch.tsx`: show inline error card with retry button.

## 6. Credits Purchase

**Stripe webhook (`supabase/functions/stripe-webhook/index.ts`)**
- On `checkout.session.completed` with `metadata.type === 'credits'`:
  - Idempotency: check `credit_transactions` for existing `stripe_payment_id = session.id`; skip if found.
  - Call RPC `add_credits(p_user_id, p_amount, p_action='purchase', p_description, p_payment_id=session.id)`.
- On `invoice.paid` for subscriptions: also grant monthly credits via `add_credits(..., p_action='subscription_grant')`.

**Frontend**
- After successful checkout return URL hit, refresh `profiles.credits` via `useCredits` hook (`refetch()`).
- `CreditBalance.tsx` already subscribes; ensure it reads `profiles.credits` not the deprecated `credits` table view.

## 7. Onboarding + Settings

**Onboarding steps (`src/pages/onboarding/Step*.tsx`)**
- All updates use `TablesUpdate<'profiles'>` shape with snake_case columns: `role_type, experience_years, target_role, target_companies, interview_date, audio_input_device, noise_suppression, stealth_mode, overlay_opacity, overlay_position, overlay_hotkey, overlay_font_size, preferred_model, preferred_language`.
- Final step writes `{ onboarding_completed: true, onboarding_step: 5 }`.
- Wrap each `update` in try/catch; toast precise error message; do not advance step on failure.

**Auth guard (`src/App.tsx` or route layout)**
- After login, query profile; if `!onboarding_completed`, redirect to `/onboarding/step{onboarding_step || 1}`.

**Settings (`src/pages/app/settings/Settings.tsx`)**
- Load via `profiles` select; group fields into Account / Audio / Overlay / AI / Privacy.
- Save patches via `update(...).eq('id', user.id)`; on success, update `userStore` immediately for instant UI feedback. Toast success/error.

## 8. Guide Versioning

- Add `src/lib/constants/version.ts`:
  ```ts
  export const APP_VERSION = '1.4.0';
  export const APP_LAST_UPDATED = '2026-05-06';
  ```
- In `Help.tsx` / guide pages, render header chip:
  `Clarify AI · v{APP_VERSION} · Updated {APP_LAST_UPDATED}`.
- Bump `version` in `package.json` to match.

## Technical Details / Files Touched

```
NEW
  supabase/functions/generate-mocktest/index.ts
  src/lib/constants/version.ts

EDITED — Mock tests
  src/pages/app/mock-tests/MockTestSetup.tsx
  src/pages/app/mock-tests/MockTestSession.tsx
  src/hooks/useSessionOrchestrator.ts (test-response persistence)

EDITED — Dashboard / Rooms
  src/pages/app/Dashboard.tsx
  src/pages/app/rooms/CreateRoom.tsx
  src/pages/app/rooms/RoomsList.tsx
  src/hooks/useRoom.ts

EDITED — Companies
  supabase/functions/company-research/index.ts (and siblings)
  src/pages/app/companies/CompanyResearch.tsx

EDITED — Credits
  supabase/functions/stripe-webhook/index.ts
  src/hooks/useCredits.ts
  src/components/billing/CreditBalance.tsx

EDITED — Onboarding / Settings
  src/pages/onboarding/OnboardingStep[1-5]*.tsx
  src/pages/app/settings/Settings.tsx
  src/App.tsx (onboarding redirect guard)

EDITED — Guide
  src/pages/marketing/Help.tsx
  package.json
```

## Validation After Implementation

Run end-to-end in preview:
1. Create mock test → questions generated → answer → submit → analysis row.
2. Dashboard loads all tiles with real data (and survives one failing query).
3. Create practice room → appears in list → join inserts participant.
4. Trigger Stripe test purchase → balance increments exactly once.
5. New user signup → onboarding redirect → all 5 steps persist → settings update reflects instantly.
6. Guide page shows version + date.
7. Companies research EF returns JSON without 500.

After approval I'll implement in this order: Guide → Onboarding/Settings → Credits webhook → Practice Rooms → Dashboard → Companies EFs → Mock Test EF + UI (largest, last).
