# Fix All P0 Audit Blockers (F1–F10)

You explicitly asked to fix everything at one go, overriding the usual component-by-component guardrail for this turn. Plan below executes all 10 wire-up fixes from the audit in a single build pass, ordered so dependencies land first.

## Verification first (read-only)
Before editing, re-read current state of the 14 target files to confirm each bug still exists (the eslint/cleanup passes may have touched some):
- `src/hooks/useLiveCopilot.ts`, `src/lib/ai/modelRouter.ts`, `src/lib/ai/geminiClient.ts`
- `src/hooks/useDeepgramStream.ts`
- `src/pages/app/mock/MockInterview.tsx`, `src/lib/api/ai.ts`
- `src/hooks/useRoom.ts`, `src/pages/app/rooms/NewRoom.tsx`
- `src/pages/app/interviews/NewInterview.tsx`, `src/hooks/useInterviewScheduler.ts`
- `src/components/overlay/OverlayToolbar.tsx`, `src/components/overlay/OverlaySettings.tsx`, `src/store/overlayStore.ts`, `src/lib/overlay/windowManager.ts`
- `src/pages/app/prep/PrepLab.tsx` (+ StarBuilder, ProjectBuilder, Rephraser, CodingHints, SystemDesign)
- `src/hooks/useResumeContext.ts`, `src/lib/ai/contextEnvelopeBuilder.ts`, `src/pages/app/documents/ResumeDetail.tsx`
- Edge fns: `generate-answer`, `generate-questions`, `generate-practice-questions`, `schedule-interview`, `parse-resume`, `parse-question-pdf`

If any file is already correct, skip that fix and note it.

## Fixes

### F1 — Gemini answers
- `generate-answer/index.ts`: normalize response to `{ text, usage }` for both SSE chunks and final JSON.
- `useLiveCopilot.ts`: read `text` field; remove OpenAI-shape fallback.
- `modelRouter.ts`: default model `gemini-2.0-flash` (per project memory) when profile.preferred_model unset.

### F2 — Deepgram WebSocket auth
- `useDeepgramStream.ts` (+ socket helper in `src/lib/audio/`): open WS with `new WebSocket(url, ['token', tempKey])` subprotocol instead of querystring. Preserve reconnect/backoff.

### F3 — Mock interview question generation
- `MockInterview.tsx` + `lib/api/ai.ts`: send `{ type, role, company, count }`.
- `generate-questions/index.ts`: zod-validate that shape; keep backward compatibility with mock-test caller via discriminated union.

### F4 — Practice rooms create
- `useRoom.ts`: require auth (`requireUserId`) before insert; after `rooms` insert, immediately insert host into `room_participants` with role `host`. Surface RLS error text via toast.
- `NewRoom.tsx`: disable submit while pending; redirect on success.

### F5 — Schedule interview
- `schedule-interview/index.ts`: zod-validate; calendar fields optional; always upsert `interviews` row + initial `interview_rounds` entry; return id.
- `NewInterview.tsx` + `useInterviewScheduler.ts`: send minimal payload (title, company, scheduled_at, type); optimistic update with rollback.

### F6 — Overlay minimize + add/edit
- `OverlayToolbar.tsx`: wire `onClick` for minimize to `windowManager.minimize()` (web) / IPC bridge (electron).
- `OverlaySettings.tsx`: persist add/edit/reorder via `overlayStore` actions; ensure store has `setPanels`, `togglePanel`, `reorderPanels`.
- Consolidate `IndexManager.ts` + `zIndexManager.ts` deferred to Phase 3 — leave both for now, just use `zIndexManager` in new code.

### F7 — Prep Lab CTAs
- `PrepLab.tsx` + 5 sub-tools: convert to controlled inputs; derive `disabled` from `!input.trim() || loading`; ensure `onClick` calls the edge fn handler.

### F8 — Resume → prompts propagation
- `parse-resume/index.ts`: after writing `resume_versions.parsed_data`, also upsert into `documents.parsed_skills/experience/education/summary` and optionally `profiles.target_role` when empty.
- `contextEnvelopeBuilder.ts`: always include latest resume parsed data when user_id present.
- `generate-answer/index.ts`: accept envelope; inject resume_context into prompt.
- `ResumeDetail.tsx` / cover-letter UI: pre-fill from latest `resume_versions.parsed_data`.

### F9 — Mock-test dedupe
- Migration: `CREATE UNIQUE INDEX IF NOT EXISTS questions_subject_text_uq ON public.questions (subject, md5(question_text));`
- `generate-practice-questions/index.ts`: in-memory dedupe + insert with `ON CONFLICT DO NOTHING`; return inserted count.

### F10 — parse-question-pdf real extraction
- `parse-question-pdf/index.ts`: replace placeholder prompt with structured MCQ extraction prompt (question, options[4], correct_answer, explanation, subject, topic, difficulty); validate via zod; insert into `questions`.

## Database changes
One migration for F9 unique index. No schema changes elsewhere (all other fixes are app/edge logic only).

## Verification
- TypeScript build runs automatically.
- Deploy edge functions: `generate-answer`, `generate-questions`, `generate-practice-questions`, `schedule-interview`, `parse-resume`, `parse-question-pdf`.
- Smoke-test via `supabase--curl_edge_functions` for each updated edge fn with the new payload shape.
- Ask user to manually verify live (Deepgram + Gemini) since those need browser mic/audio.

## Guardrails honored
- No changes to working features (auth, billing, mock-test session engine, admin, RLS).
- No bulk refactors (z-index consolidation, settings merge, SEO sweep, a11y sweep → deferred to Phase 2/3).
- Each file edit is surgical and additive.

## Out of scope (deferred)
Phase 2/3/4 items from the audit: sidebar nav additions, SettingsSecurity merge, MockSession dedupe, a11y sweep, app-route SEO, Playwright e2e, i18n, reminders cron.

Approve to execute all 10 fixes + 1 migration in build mode.
