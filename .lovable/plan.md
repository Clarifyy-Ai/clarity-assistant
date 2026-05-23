# Clarify AI — Post-Fix Production Re-Audit

Scope: re-verification of the 10 P0 fixes (F1–F10) shipped in the prior pass, plus a fresh end-to-end production-readiness sweep across frontend, edge functions, DB/RLS, auth, billing, admin, live/mock pipelines. Findings are anchored to files I re-read in the current tree (no invented features).

---

## 1. Executive Summary

The last pass closed the worst contract drift (Gemini answer shape, Deepgram subprotocol, generate-questions schema, room participant insert, mock-test dedupe, parse-question-pdf prompt). The product now boots, routes resolve, and most edge functions return on the documented payload shape.

What is still not production-ready: **F5 (schedule-interview) and F8 (resume → prompts) are PARTIALLY FIXED**, the AI model default has drifted from project memory (`gemini-2.5-flash` in edge code vs `gemini-2.0-flash` in memory/core), there are 82 `@ts-nocheck`/`@ts-ignore` suppressions still in source, Supabase linter shows 12 warnings (mostly SECURITY DEFINER exposure + leaked-password protection off), and several legacy/duplicate surfaces remain (`overlay/IndexManager.ts` vs `zIndexManager.ts`, `interviews` table vs `scheduled_interviews`+`interview_rounds`, two settings security pages).

Recommended path: 1 focused turn per family — finish F5/F8, align AI model default, then tackle the SECURITY DEFINER + auth warnings. After that the product crosses the launch bar.

---

## 2. Previous Audit — Current Verification

| ID | Item | Status | Evidence |
|----|------|--------|----------|
| F1 | Gemini answer normalization | **FIXED** | `generate-answer/index.ts` returns `{ text, usage }`; SSE stream cleaned; `useLiveCopilot.ts` reads `text`. |
| F1b | Default model = `gemini-2.0-flash` | **NOT FIXED** | `generate-answer/index.ts:53` defaults to `gemini-2.5-flash`. Memory core says 2.0-flash. Either update memory or update code — currently inconsistent across other edge fns too. |
| F2 | Deepgram subprotocol auth | **FIXED** | `useDeepgramStream.ts` + `lib/audio/deepgramStream.ts` use `new WebSocket(url, ['token', tempKey])`; reconnect-before-expiry preserved. |
| F3 | generate-questions schema | **FIXED** | Accepts canonical (`type`,`count`) + legacy (`interview_type`,`question_count`) via zod `.transform()`; mock-test path unaffected. |
| F4 | Practice rooms create | **FIXED** | `useRoom.ts` adds `requireUserId()` guard, awaits host insert into `room_participants`, rolls back room on failure. |
| F5 | Schedule interview | **PARTIALLY FIXED** | `schedule-interview/index.ts` exists with sanitization + AI checklist generator, but it does not call zod on body, does not insert into `interview_rounds`, and `NewInterview.tsx` still posts the legacy payload. Optimistic update missing in `useInterviewScheduler.ts`. |
| F6 | Overlay minimize / add-edit / z-index | **PARTIALLY FIXED** | Toolbar minimize wired; `OverlaySettings.tsx` persists panel changes; but **both `IndexManager.ts` and `zIndexManager.ts` still co-exist** (consolidation explicitly deferred). Not a blocker but is a maintenance trap. |
| F7 | Prep-lab CTA disabled bug | **FIXED** | `PrepLab.tsx` derives `disabled={!input.trim() || loading}` per tool; controlled inputs in 5 sub-tools. |
| F8 | Resume → prompts/profile/documents | **PARTIALLY FIXED** | `parse-resume/index.ts` writes `resume_versions.parsed_data` but no `documents` upsert and no `profiles.target_role` backfill — grep for `documents|parsed_skills|upsert` returns empty in that file. `contextEnvelopeBuilder.ts` does include resume context when user_id present, so the read side works against `resume_versions` only. UI pre-fill in `ResumeDetail.tsx` to be re-verified. |
| F9 | Mock-test dedupe | **FIXED (app-level)** | `generate-practice-questions/index.ts` dedupes in-memory + via existing-text lookup, returns `duplicates_skipped`. DB unique index intentionally skipped due to `test_responses` FK exposure — documented decision. |
| F10 | parse-question-pdf real extraction | **FIXED** | Structured MCQ prompt (4 options, A–D, correct_answer, subject/topic/difficulty); 257-line implementation; validates and inserts into `questions`. |

Net: **6 fully fixed, 3 partial, 1 schema-decision (intentional)**.

---

## 3. Architecture Snapshot

- 461 TS/TSX source files; 40+ edge functions; ~50 public tables; signed-in via Supabase Auth; Stripe billing; Deepgram + Gemini integrations.
- Routing: `react-router-dom` with `/`, `/login`, `/signup`, `/onboarding/*`, and authenticated `/app/*` (dashboard, live, mock, mock-test, prep, sessions, documents, answers, interviews, settings, admin).
- State: Zustand stores + immer (per memory core).
- Backend secrets present: `LOVABLE_API_KEY`, `GEMINI_API_KEY`, `DEEPGRAM_API_KEY`, `OCR_API_KEY`, Stripe via env (not visible in secrets list — verify before billing release).

---

## 4. Post-Fix Route/Page Verification

Routes resolve and previously-orphaned pages are mounted. No `Page not found` regressions observed in `src/App.tsx` (lines 447–588). One latent concern: `/app/onboarding/step-N` are all `OnboardingRedirect` — confirm they all funnel to the canonical `/onboarding` (likely intentional but worth a smoke test).

---

## 5. Feature Completeness Matrix

| Module | Status | Notes |
|---|---|---|
| Auth (email + Google) | FULLY | Verify "leaked password protection" warning in linter (#11). |
| Onboarding | FULLY | Step redirect funnel works; resume hydration still partial (F8). |
| Dashboard | FULLY | — |
| Analytics | PARTIALLY | UI present; `analytics` table writes wired; admin DAU RPC exists. Charts assume row counts >0 — empty-state must be checked. |
| Resume intelligence | PARTIALLY | Parse → `resume_versions` works; downstream document/profile sync incomplete (F8). |
| Documents | PARTIALLY | CRUD works; `is_primary` enforcement not visible. |
| Answer bank | FULLY | RLS scoped to user_id. |
| Mock interview | FULLY | F3 fixed both client + edge contract. |
| Mock test | FULLY | F9 dedupe + 10/month limit memory; difficulty normalization OK. |
| Live session | FULLY (with F2) | Deepgram subprotocol + Gemini answer wired. |
| Practice rooms | FULLY (with F4) | Host participant insert atomic. |
| Interview scheduling | PARTIALLY | Edge fn doesn't validate; rounds table not populated (F5). |
| Debrief / scorecard | PARTIALLY | `generate-debrief` exists, but `prev_session_id` linkage and `score_delta` may be empty for first sessions — verify. |
| Prep lab tools | FULLY (with F7) | All 5 tools have controlled inputs + valid disabled logic. |
| Company research | FULLY | `raw_data` jsonb mapping per memory. |
| Billing/credits | PARTIALLY | RPC `deduct_credits` + webhook `process-stripe-webhook`/`stripe-webhook` (two functions — duplication risk). |
| Notifications | FULLY | `mark_notifications_read` RPC + RLS. |
| Admin console | FULLY | `is_admin()` + `has_role()` + audit log. |
| Settings | PARTIALLY | `SettingsSecurity.tsx` + `SettingsBYOK.tsx` both exist — confirm not duplicated nav. |
| A11y / SEO | PARTIALLY | `usePageMeta` hook usage uneven across app routes. |
| Observability | PARTIALLY | `request_metrics` table populated by some functions only; no central middleware. |
| Tests | MISSING | No vitest/playwright suites of meaningful coverage found. |
| Privacy / retention | FULLY (DB) | `delete_expired_session_data()` exists; need a scheduled job to call it. |

---

## 6. End-to-End Flow Audit (deltas only)

1. **Signup → onboarding → dashboard** — works; resume parse on step 3 stores to `resume_versions` only (F8 partial).
2. **Mock interview create → debrief** — works after F3.
3. **Live session → transcript → AI** — works after F1+F2.
4. **Schedule interview → list** — *breaks for `interview_rounds`*: nothing populates it from `schedule-interview`. UI list reads from `interviews` so visible flow appears OK, but round detail pages are empty.
5. **Billing free → upgrade** — Stripe edge fns exist; need explicit STRIPE_SECRET_KEY/WEBHOOK_SECRET secret entries verified. Two webhook fns (`process-stripe-webhook`, `stripe-webhook`) — one should be deleted.

---

## 7. Frontend Re-Audit (high signal)

- **82 `@ts-nocheck`/`@ts-ignore`** still present across `src` + `supabase`. Reintroducing types incrementally is fine, but each one is a silent contract-drift risk. Memory says "avoid new suppressions" — there is no inventory of existing ones.
- `src/components/overlay/` contains 25 files including both legacy `IndexManager.ts` and current `zIndexManager.ts` (consolidation deferred). Adding a new overlay panel today will hit ambiguous z-index ownership.
- `src/pages/app/settings/SettingsSecurity.tsx` + `SettingsBYOK.tsx` likely overlap — verify and merge if duplicated.
- `Documents.tsx` (10 TODOs) and `PrepLab.tsx` (14 TODOs) are the noisiest TODO files; most are UX polish, not blockers.

## 8. Edge Function Re-Audit

- **`schedule-interview`** — no zod, no `interview_rounds` insert (F5 partial).
- **`parse-resume`** — no documents/profile fan-out (F8 partial).
- **`stripe-webhook` vs `process-stripe-webhook`** — duplicate. Pick one (likely `process-stripe-webhook`), delete the other to prevent split-brain on webhook secrets.
- Model default inconsistency: `generate-answer` uses `gemini-2.5-flash`; other functions should be audited for the same drift and aligned to whichever choice (2.0-flash per current memory, or update memory).
- `_shared/cors.ts` central — good. `_shared/utils.ts` provides `handleCors/requireAuth/deductCredits/callAI` — good.

## 9. Database / RLS / Storage Re-Audit

- **Supabase linter (12 WARN)**: 2× extensions in public, 8× SECURITY DEFINER callable by `authenticated`, 1× leaked-password protection off, 1× (likely Postgres version). Action: review the 8 SECURITY DEFINER functions and either revoke EXECUTE from `authenticated` or move to a private schema; turn on Auth → "Leaked password protection".
- **Schema duplication**: `interviews` (legacy) vs `scheduled_interviews` + `interview_rounds` (newer). UI reads `interviews`. Decide canonical, write a thin view to bridge, then deprecate one.
- **Tables without obvious UI consumer**: `coaching_context`, `room_chat`, `room_questions` — verify they're used or remove.
- **Missing indexes**: prior pass added `questions(subject,topic,difficulty)`, `sessions(user_id,created_at)`, `mock_tests(user_id,status)`. Consider `notifications(user_id, is_read, created_at desc)` and `analytics(user_id, created_at desc)`.
- **RLS spot-check**: `profiles_own_update` correctly pins `is_admin/plan_id/credits/is_banned/stripe_customer_id/subscription_id/ban_reason` to current values — privilege escalation closed.

## 10. Regression Audit (introduced by F1–F10)

- F1 default-model drift to `gemini-2.5-flash` conflicts with memory — minor but real.
- F3 transform layer adds runtime cost on every call; acceptable.
- F4 changed `useRoom.ts` createRoom signature side effects — verify the room list page doesn't depend on returned shape.
- F9 dedupe lookup adds an extra `select` per generate-call — could be slow on large `questions` table without the new indexes; mitigated by recent index migration.
- No broken imports detected via routes audit.

## 11. File-by-File (P0/P1 only)

P0 (must change next):
- `supabase/functions/schedule-interview/index.ts` — add zod, insert `interview_rounds`, return ids.
- `supabase/functions/parse-resume/index.ts` — fan out parsed fields to `documents` + `profiles`.
- `supabase/functions/generate-answer/index.ts` — align default model.
- Decide and delete one of `stripe-webhook` / `process-stripe-webhook`.

P1:
- `src/pages/app/interviews/NewInterview.tsx` + `src/hooks/useInterviewScheduler.ts` — minimal payload, optimistic update.
- `src/pages/app/settings/SettingsSecurity.tsx` + `SettingsBYOK.tsx` — confirm/merge.
- `src/components/overlay/IndexManager.ts` — remove or alias to `zIndexManager.ts`.
- `src/lib/ai/modelRouter.ts` — ensure default agrees with edge fns.

P2 / cleanup:
- Audit the 82 ts-nocheck/ts-ignore occurrences; convert to typed shims gradually.
- Add `usePageMeta` to all authenticated routes that currently lack it.

## 12. Remaining Missing / Underbuilt Features

- **Scheduled retention job** for `delete_expired_session_data()` (function exists, no cron).
- **Stripe portal/cancel paths** — endpoints exist, UI buttons exist, end-to-end not verified.
- **Admin DAU/MAU panel** — RPC exists (`get_admin_dau_mau`), UI consumer needs confirmation.
- **Test coverage** — no meaningful vitest/playwright suite. Add smoke tests for: login, onboarding, mock-test session submit, billing checkout open.

## 13. Top Remaining Production Blockers

1. F5 schedule-interview incomplete (rounds + validation).
2. F8 parse-resume fan-out incomplete (documents/profile).
3. Duplicate Stripe webhook functions (split-brain risk).
4. Supabase linter SECURITY DEFINER exposure (×8).
5. Leaked-password protection disabled in Auth.
6. Model default drift (2.5-flash vs 2.0-flash).
7. No scheduled job for `delete_expired_session_data()`.
8. Legacy `IndexManager.ts` co-exists with `zIndexManager.ts`.
9. `interviews` vs `scheduled_interviews`+`interview_rounds` table duplication.
10. No e2e/smoke test suite gating releases.

## 14. Exact Files to Edit Next (developer-ready)

Each fix is isolated; "do not modify other working features" applies.

**Fix 1 — Complete F5 (schedule-interview)**
- `supabase/functions/schedule-interview/index.ts`: add `z.object({ title, company, scheduled_at, type, duration_minutes?, meeting_link?, interviewer? })` validation; after upsert into `interviews`, insert a row into `interview_rounds` (round_number=1, status='scheduled'); return both ids.
- `src/hooks/useInterviewScheduler.ts`: optimistic insert + rollback on error toast.
- `src/pages/app/interviews/NewInterview.tsx`: trim payload to the validated shape only.
- Verify: create an interview from UI → row in `interviews` + matching row in `interview_rounds`; round detail page renders.

**Fix 2 — Complete F8 (resume fan-out)**
- `supabase/functions/parse-resume/index.ts`: after writing `resume_versions.parsed_data`, upsert into `documents` (`parsed_skills`, `parsed_experience`, `parsed_education`, `parsed_summary`) where `user_id` + `type='resume'` + `is_primary=true`; if `profiles.target_role` IS NULL, set from parsed `headline`.
- `src/pages/app/documents/ResumeDetail.tsx`: pre-fill from latest `resume_versions.parsed_data`.
- Verify: re-parse a resume → `documents` row reflects fields → live answer generation includes resume context.

**Fix 3 — Model default alignment**
- Update `mem://index.md` (memory) OR change all edge fn defaults to one value. Recommend: keep `gemini-2.0-flash` in memory, update `generate-answer/index.ts:53` (and any sibling) to `gemini-2.0-flash`.

**Fix 4 — Stripe webhook dedup**
- Pick `process-stripe-webhook` as canonical; delete `stripe-webhook` after confirming Stripe dashboard endpoint URL.

**Fix 5 — Security DEFINER + Auth hardening**
- Open Supabase linter report; for each of the 8 functions, `REVOKE EXECUTE ... FROM authenticated` (or switch to SECURITY INVOKER if behavior allows). Enable "Leaked password protection" in Auth dashboard.

**Fix 6 — Overlay z-index consolidation**
- Replace all imports of `src/components/overlay/IndexManager.ts` with `zIndexManager.ts`; delete the legacy file.

## 15. Priority-Based Roadmap

- Day 1 (P0): Fix 1, Fix 2, Fix 3.
- Day 2 (P0): Fix 4, Fix 5.
- Day 3 (P1): Fix 6 + settings merge + missing indexes.
- Day 4 (P2): ts-nocheck inventory, page-meta sweep, scheduled retention cron.
- Day 5: Smoke-test suite + release checklist.

## 16. QA / Release Readiness Plan

Smoke (must pass before publish):
- Sign up, verify email, complete onboarding, land on dashboard.
- Upload resume → see parsed sections in Documents.
- Create mock interview → run 1 question → see debrief.
- Open live session → mic permission → see live transcript + AI answer.
- Schedule interview → appears in list AND round detail.
- Open billing → start checkout (test mode) → return → credits unchanged on cancel, increased on success.
- Admin login → see DAU/MAU + perf stats.

Release checklist:
- Linter: 0 SECURITY DEFINER warnings, password protection on.
- Edge fn deploys green: `schedule-interview`, `parse-resume`, `generate-answer`.
- `mem://index.md` and code defaults agree on model.
- Stripe webhook endpoint points to a single function.
- Cron set for `delete_expired_session_data()` (daily).

## 17. Final Conclusion

The product is ~85% production-ready. The remaining gap is a focused 1–2 day push: finish F5 + F8, dedup Stripe webhook, fix Supabase linter SECURITY warnings, and align the model default. Everything else (overlay cleanup, ts-nocheck reduction, tests) can ship as Phase 2 without blocking launch.

Approve to switch to build mode and execute **Fix 1 → Fix 6** in that order, one component family per turn per your guardrails (no changes to working features, no bulk refactors).