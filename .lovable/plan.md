
# Clarify AI — Production Readiness Fix Execution Plan

Source inputs: completed manual-driven audit (`.lovable/plan.md`), current repo, Clarify AI Complete Manual. Assumes **Path A** (remove covert/stealth, reposition as practice + post-interview analytics). All risky covert features are REMOVE/DISABLE — never improved.

---

## 1. Executive Production Readiness Fix Summary

Verdict today: **RED — not launchable**. Five blocker classes:

1. **Compliance** — stealth/evasion/covert-assistance code shipped (electron flags, screen-capture blocker, panic concealment, hide-from-Alt-Tab). Fraud-facilitation liability. **MUST be removed before any launch.**
2. **Billing truth drift** — DB defaults 50 credits, manual says 200/2000/∞; Pricing page sells $29.99 packs, manual sells $29/$79 subscriptions. Three sources of truth disagree.
3. **Model routing fiction** — manual promises Claude / GPT-4o / smart routing; code hardcodes Gemini 2.0 Flash everywhere. Either build it or rewrite manual.
4. **BYOK security fiction** — manual claims AES-256 server-side; code stores keys in `localStorage`. Must remove claim or build it.
5. **Domain mismatch** — `/app/mock-test` is JEE/NEET MCQ engine; manual sells interview Q&A practice. Pick canonical product.

After P0 fixes (≈ 1 sprint), product is launchable as **"AI interview practice + post-interview analytics, Gemini-only, $29 Pro / $79 Enterprise"**.

---

## 2. P0 / P1 / P2 / P3 Fix Matrix

### P0 — Launch blockers (must ship before public release)

| # | Issue | Manual ch. | Fix type | Files / DB | Effort | Regression risk | Verify |
|---|---|---|---|---|---|---|---|
| P0-1 | **Remove all stealth/covert/evasion code** | 6, 8.1, 8.3 | feature removal + manual rewrite | `electron/main.cjs`, `electron/preload.{cjs,ts}`, `src/lib/stealth/*`, `src/lib/overlay/screenCaptureEvasion.ts`, `src/lib/overlay/stealthMouse.ts`, `src/hooks/useStealthMouse.ts`, `src/hooks/usePrivateMode.ts` (audit), `src/lib/capture/screenShare.ts` (drop `selfBrowserSurface:"exclude"`), `src/store/overlayStore.ts` (`stealth_mode`), `profiles.stealth_mode` column default→false, `docs/STEALTH_FEATURES.md` delete | M (1–2d) | Medium — overlay still renders as normal window | Build runs; overlay visible in screen share; no `setContentProtection`, `skipTaskbar`, `WDA_EXCLUDEFROMCAPTURE`. Grep `stealth\|evasion\|skipTaskbar\|content[-_]?protection` returns 0 hits in app code. |
| P0-2 | **Credit defaults align with chosen pricing** | 11 | migration + code | `handle_new_user()` (200 free), `subscriptions.monthly_credits` default, `src/lib/billing/priceCalculator.ts`, `src/components/billing/PricingCard.tsx`, `src/pages/marketing/Pricing.tsx`, central `src/lib/constants/pricing.ts` (new) | S (½d) | Low — only affects new users | New signup row has 200 credits; pricing page, settings, manual all show same numbers. |
| P0-3 | **Pricing page vs Stripe vs manual unified** | 11 | code + docs rewrite | `src/pages/marketing/Pricing.tsx`, `src/components/billing/*`, Stripe products (manual op), `docs/QA_MANUAL.md`, manual ch.11 | S | Low | Single `PRICING` constant imported everywhere; Stripe price IDs match. |
| P0-4 | **Model routing claim vs reality** | 8.2 | manual rewrite (Path A) — keep Gemini-only | `src/lib/ai/modelRouter.ts` (collapse to gemini), `src/lib/ai/modelMapping.ts`, `src/store/overlayStore.ts` `active_model`, settings model picker, manual ch.8.2, marketing | S | Low | Settings shows only "Gemini 2.0 Flash"; no UI mention of Claude/GPT-4o. |
| P0-5 | **BYOK security fiction** | 8.5, 13 | feature removal for launch | `src/lib/security/byokVault.ts` delete, `src/pages/app/settings/SettingsBYOK.tsx` remove route, `profiles.byok_*_hint` keep nullable but hidden; manual ch.8.5 rewrite "BYOK coming soon" | S | Low — feature not used in prod paths | `/app/settings/byok` 404; no `localStorage` writes for API keys. |
| P0-6 | **Mock test domain mismatch — pick canonical** | 4 | de-scope | If canonical = interview practice: gate `/app/mock-test` JEE/NEET behind admin flag or delete pages `src/pages/app/mock-test/*`, drop nav entry in `AppSidebar.tsx`. Keep DB tables (mock_tests, questions) for future. | M (1d) | Medium — large surface | Route not in nav; sidebar clean; `npm run build` passes. |
| P0-7 | **Re-enable screen-capture exclusion removal** ⇒ verify overlay appears in Zoom/Meet test share | 6 | manual QA | n/a | S | n/a | Live test on macOS + Windows: overlay visible in Zoom "share screen". |
| P0-8 | **CORS wildcard → whitelist** | 13 | edge function | `supabase/functions/_shared/cors.ts` set origin allowlist (`clarify-aii.lovable.app`, custom domain, localhost dev) | S | Low | curl from unlisted origin returns CORS error. |
| P0-9 | **Remove deceptive privacy/security claims** | 13 | docs rewrite | `src/pages/marketing/Privacy.tsx`, `Terms.tsx`, `docs/STEALTH_FEATURES.md` delete, manual ch.13 | S | None | Privacy page matches reality (Gemini processor, 90d retention, no AES-256 BYOK claim). |
| P0-10 | **Live Co-Pilot covert use case rewrite** | 8.1 | manual + UI copy | `src/pages/app/live/*`, `src/components/live/*` — reframe as "Practice with live AI coach", add warning banner "Do not use during real interviews — violates most employer policies." | S | Low | UI shows banner; manual rewritten. |

### P1 — Required for quality launch (week 2)

| # | Issue | Fix type | Files | Effort |
|---|---|---|---|---|
| P1-1 | Real readiness score logic (currently placeholder) | code | `src/hooks/useConfidenceScore.ts`, `src/pages/app/Dashboard.tsx`, new SQL view `v_user_readiness` | M |
| P1-2 | Low-credit warning wired to balance | code | `src/components/billing/CreditBalance.tsx`, `src/hooks/useCredits.ts`, toast on <20 | S |
| P1-3 | Enterprise unlimited rendering | code | PricingCard, CreditBalance show "∞" when `plan_id='enterprise'` | S |
| P1-4 | Retention enforcement actually runs | edge function + cron | deploy `delete_expired_session_data()` via pg_cron daily; expose admin panel button | S |
| P1-5 | Notification toggles wired to sender | code + edge | `src/hooks/useNotifications.ts`, new `send-digest` cron edge fn | M |
| P1-6 | Onboarding fields propagate to prompts | code | `src/lib/ai/contextEnvelopeBuilder.ts` consume `role_type`, `experience_years`, `target_role` | S |
| P1-7 | Resume/JD parsed data feeds prompts & gap analysis | code | `useResumeContext.ts`, `contextEnvelopeBuilder.ts`, prep tools | M |
| P1-8 | STAR Builder / Rephraser save to Answer Bank | code | `src/hooks/useSTARBuilder.ts`, `src/store/answerBankStore.ts` | S |
| P1-9 | Debrief uses real stored transcript + scoring | edge fn | `supabase/functions/generate-debrief/index.ts` | M |
| P1-10 | Account deletion cascades + storage cleanup | edge fn + migration | new `delete-account` edge fn; storage object purge | M |
| P1-11 | Rate limiting on AI edge functions | edge fn | `_shared/rateLimit.ts` (token bucket per user_id, 60/min) | S |
| P1-12 | Export flows (transcript CSV, analytics CSV) | edge fn | `supabase/functions/export-*` deploy & wire | M |

### P2 — Polish & manual alignment (week 3)

| # | Issue | Fix type | Effort |
|---|---|---|---|
| P2-1 | Consolidate duplicate Settings pages | code | S |
| P2-2 | Provider mismatch — manual says Google/GitHub/LinkedIn/Azure; ship Google only, rewrite manual | docs | S |
| P2-3 | XP/streak triggers verified end-to-end | code+SQL | S |
| P2-4 | Diarization rendering polish | code | S |
| P2-5 | Warmup calibration persistence | code | S |
| P2-6 | Per-action credit cost central table | migration + code | S |
| P2-7 | Admin audit log surface in admin panel | code | S |

### P3 — Post-launch backlog

True multi-model routing; BYOK with server-side AES-GCM via Supabase Vault; cover-letter generator; LinkedIn/Azure OAuth; Mock-test product split as separate vertical; rich analytics heatmaps.

---

## 3. Product-Contract Alignment Plan

| Manual claim | Reality | Decision |
|---|---|---|
| 200 free / 2000 Pro / ∞ Ent credits | DB defaults 50/50 | **Fix product** → migration to 200/2000/null+UI∞ |
| Multi-model smart routing (Claude/GPT-4o/Gemini) | Gemini only | **Rewrite manual** (Path A) — Gemini-only launch |
| AES-256 server-side BYOK | localStorage only | **Remove feature** + rewrite manual ("BYOK coming soon") |
| Stealth overlay invisible to Zoom/Teams | Implemented | **Remove feature** + rewrite manual + marketing |
| Google/GitHub/LinkedIn/Azure SSO | Google only | **Rewrite manual** to Google-only at launch |
| Mock test for interview prep | JEE/NEET MCQ engine | **De-scope** mock-test route; keep tables |
| "End-to-end encrypted recordings" (if present) | Not implemented | **Remove claim** |
| 90-day retention enforced | Function exists, no cron | **Fix product** — enable pg_cron |
| Cover-letter generator | Missing | **Remove from manual** for v1 |
| $29/mo Pro, $79/mo Ent | Pricing page shows $29.99 packs | **Fix product** — subscriptions |

---

## 4. Compliance / Risk Removal or Gating Plan

All items below are **REMOVE** (Path A). Do not flag-gate covert features — flags can be flipped.

| Risky surface | Files | Action |
|---|---|---|
| Electron content protection / skipTaskbar / panel type | `electron/main.cjs` lines for `setContentProtection`, `skipTaskbar:true`, `type:"panel"/"toolbar"`, `setVisibleOnAllWorkspaces(...visibleOnFullScreen:true)` | Delete those lines; window becomes normal frameless overlay visible in screen share |
| Stealth bridge | `electron/preload.{cjs,ts}` `electronStealth` API | Delete |
| Screen capture evasion | `src/lib/overlay/screenCaptureEvasion.ts`, `src/lib/stealth/screenCaptureBlocker.ts`, `src/lib/stealth/electronBridge.ts`, `src/lib/stealth/stealthActions.ts`, `src/lib/stealth/stealthConfig.ts` | Delete directory `src/lib/stealth/`; delete `screenCaptureEvasion.ts` |
| Stealth mouse / mouse guard | `src/lib/overlay/stealthMouse.ts`, `src/hooks/useStealthMouse.ts` | Delete |
| Panic hotkey concealment | `electron/main.cjs` Cmd+Shift+P → keep as plain "hide window" or remove | Simplify: keep only Cmd+Shift+H toggle; remove Panic semantics from UI/manual |
| Self-exclude from getDisplayMedia | `src/lib/capture/screenShare.ts` `selfBrowserSurface:"exclude"` | Change to `"include"` (default) so overlay is shareable |
| `stealth_mode` profile column | `profiles.stealth_mode` default true | Migration: default false; hide UI toggle |
| `overlayStore.stealth_mode` | `src/store/overlayStore.ts` | Remove field & usages |
| Live Co-Pilot covert framing | `src/hooks/useLiveCopilot.ts`, `src/pages/app/live/LiveOverlay.tsx` | Reframe as practice; add visible disclaimer banner |
| Docs/marketing covert claims | `docs/STEALTH_FEATURES.md`, `replit.md`, `README.md`, landing copy | Delete file; rewrite copy |

Verification: `rg -n "stealth|skipTaskbar|setContentProtection|screenCaptureBlocker|selfBrowserSurface\\s*:\\s*\"exclude\"|stealthMouse|WDA_EXCLUDEFROMCAPTURE"` returns **0** matches in `src/`, `electron/`, `docs/`, marketing pages.

---

## 5. Workstream-by-Workstream Fix Plan

### WS1 — Product/Manual/Copy alignment
Deliverables: single `src/lib/constants/pricing.ts` source of truth; rewritten manual ch.6, 8.1, 8.2, 8.3, 8.5, 11, 13; rewritten Privacy/Terms; landing/Pricing pages regenerated from constants.

### WS2 — Compliance removal (see §4). Owner: senior eng. Must complete before WS-anything-else ships to prod.

### WS3 — Auth/Onboarding/Profile
- Remove non-Google OAuth buttons in `src/components/auth/OAuthButton.tsx` & Login/Signup pages.
- Confirm `onboarding_completed` gate in `ProtectedRoute.tsx`.
- Wire `role_type`, `experience_years`, `target_role`, `interview_strengths/weaknesses` into `buildContextEnvelope`.

### WS4 — Dashboard/Readiness
- New SQL view `v_user_readiness` aggregating: avg debrief score (40%), session count last 30d (20%), streak (10%), filler reduction trend (15%), question diversity (15%).
- `useConfidenceScore` reads it; Dashboard widget renders.
- `CreditBalance` shows ∞ when `plan_id='enterprise'`; toast when < 20.

### WS5 — Documents pipeline
- Verify `upload-resume` → `parse-resume` → `resume_versions.parsed_data` writes; backfill missing.
- `useResumeContext` reads latest parsed_data; pass into envelope.
- De-scope cover-letter from manual.
- Add retention cron (see WS13).

### WS6 — Prep tools
- STAR Builder result writes to `answers` (type='behavioral', is_polished=true).
- Rephraser writes new row referencing original.
- Coding hint depth ladder (concise/standard/deep) in `src/lib/ai/promptTemplates.ts CODING_HINT`.
- Project Builder: confirm GitHub fetch is real (`fetch-github-repo` edge fn) — else remove from UI.
- Per-action credit costs from central table.

### WS7 — Mock/Practice consolidation
- **Canonical = interview practice (Sessions)**. Mock-test (JEE/NEET) de-scoped.
- Remove `/app/mock-test/*` routes from `src/App.tsx` & sidebar; keep DB.
- Session creation: `useSessionOrchestrator` already OK; verify status transitions DRAFT→ACTIVE→COMPLETED trigger `update_user_streak`.
- Debrief link via `debriefs.session_id`.

### WS8 — Audio/Transcription
- Verify `get-deepgram-token` returns 60s TTL temp key.
- `useDeepgramStream` reconnect on socket error; flush partials on stop.
- Persist transcripts to `session_transcripts` (already exists).
- WPM/filler/silence hooks already present — add unit tests.

### WS9 — AI generation (Gemini-only launch)
- Collapse `src/lib/ai/modelRouter.ts` → always Gemini 2.0 Flash via Lovable AI Gateway.
- Remove `anthropicClient.ts`, `openaiClient.ts` from exports (`src/lib/ai/index.ts`); keep files but unexported, or delete.
- BYOK removed (P0-5).
- Edge fn `_shared/gemini.ts` stays.

### WS10 — Analytics/Debriefs
- `generate-debrief` consumes `session_transcripts` + `session_answers`; writes scores + recommendations to `debriefs`.
- Scorecard page reads `debriefs` for current session; trend chart reads last 10.
- Missed-keywords array surfaced under "Improvements" widget.

### WS11 — Billing/Credits/Stripe (single source of truth)
File: `src/lib/constants/pricing.ts`
```ts
export const PLANS = {
  free:       { credits: 200,  priceUsd: 0,  stripePriceId: null },
  pro:        { credits: 2000, priceUsd: 29, stripePriceId: 'price_xxx' },
  enterprise: { credits: null, priceUsd: 79, stripePriceId: 'price_yyy' },
} as const;
export const CREDIT_COSTS = { generate_hint:1, generate_answer:2, debrief:5, company_research:3, resume_parse:2 };
```
Migration updates `handle_new_user` (200 credits), `subscriptions` default 200. Stripe webhook (`supabase/functions/stripe-webhook`) maps `plan_id` and resets monthly credits on `invoice.payment_succeeded`.

### WS12 — Settings/Privacy/Notifications/Private Mode
- Delete duplicate settings pages (audit which is canonical).
- Remove BYOK page.
- Retention dropdown 30/60/90/180/365 writes to `profiles.data_retention_days`; cron honours it.
- `usePrivateMode` if covert → repurpose as "don't save transcript for this session"; otherwise remove.
- Notification toggles persisted in `profiles` metadata; `send-digest` edge fn cron reads & sends via Resend (add secret if used; else disable digest at launch).

### WS13 — Security/Export/Deletion/RLS
- CORS whitelist (P0-8).
- Rate limit `_shared/rateLimit.ts` table `request_metrics` already exists → reuse.
- `delete-account` edge fn: delete profile row → cascades; loop storage buckets `resumes`, `documents`, `exports` purging `user_id/*`.
- Export: `export-transcripts` edge fn produces CSV signed URL to `exports` bucket; expire 24h.
- Enable pg_cron daily 03:00 UTC `SELECT public.delete_expired_session_data();`.
- Audit RLS: `feature_flags` already admin-only; verify no public-read PII.

### WS14 — Testing/QA/Release
- Add vitest cases: `creditsManager`, `modelRouter` (returns gemini), `contextEnvelopeBuilder` (includes onboarding fields).
- Playwright smokes: signup→onboarding→session→debrief; pricing page; settings save.
- Deno tests for edge fns: `generate-hint`, `deduct-credits`, `stripe-webhook` (signature verify), `delete-account`.
- Manual QA matrix in `docs/QA_MANUAL.md` regenerated from manual chapters.
- Release gates: build green, vitest green, playwright smoke green, no `rg` hits for stealth tokens, Stripe test-mode end-to-end checkout works.

---

## 6. Exact Files to Edit by Issue
(See P0 matrix col "Files / DB" and §4 table — each row already lists files. Below adds non-obvious touches.)

- **P0-1 stealth**: also remove imports in `src/components/overlay/*`, `src/hooks/useOverlayVisibility.ts`, `src/lib/overlay/index.ts` barrel.
- **P0-2 credits**: update `src/test/lib/billing/creditsManager.test.ts` expected defaults.
- **P0-6 mock-test**: also remove `src/components/layout/AppSidebar.tsx` nav entry, `src/lib/constants/features.ts` `FEATURE_PLAN_GATES.mock_test`.

---

## 7. Database / Migration Change Plan

Single migration `production_alignment_v1.sql`:

```sql
-- 1. New signup credits 50 → 200
CREATE OR REPLACE FUNCTION public.handle_new_user() ... credits=200, monthly_credits=200 ...;
ALTER TABLE public.profiles ALTER COLUMN credits SET DEFAULT 200;
ALTER TABLE public.subscriptions ALTER COLUMN monthly_credits SET DEFAULT 200;

-- 2. Stealth off by default
ALTER TABLE public.profiles ALTER COLUMN stealth_mode SET DEFAULT false;
UPDATE public.profiles SET stealth_mode = false WHERE stealth_mode = true;

-- 3. Readiness view
CREATE OR REPLACE VIEW public.v_user_readiness AS
SELECT p.id AS user_id,
       COALESCE(AVG(d.overall_score),0)*0.40
     + LEAST(COUNT(s.id) FILTER (WHERE s.created_at>now()-interval '30 days'),20)*5*0.20
     + LEAST(p.streak_days,30)*3.33*0.10
     -- + filler trend, diversity (computed in app for now)
       AS readiness_score
FROM profiles p
LEFT JOIN sessions s ON s.user_id=p.id
LEFT JOIN debriefs d ON d.user_id=p.id
GROUP BY p.id;
GRANT SELECT ON public.v_user_readiness TO authenticated;
-- RLS via security_invoker
ALTER VIEW public.v_user_readiness SET (security_invoker = true);

-- 4. Central credit costs table (optional; or keep TS constant)
CREATE TABLE public.credit_costs (
  action text PRIMARY KEY,
  cost integer NOT NULL CHECK (cost > 0)
);
INSERT INTO public.credit_costs VALUES
 ('generate_hint',1),('generate_answer',2),('debrief',5),
 ('company_research',3),('resume_parse',2)
ON CONFLICT DO NOTHING;
ALTER TABLE public.credit_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY credit_costs_read ON public.credit_costs FOR SELECT TO authenticated USING (true);

-- 5. pg_cron retention
SELECT cron.schedule('retention_daily','0 3 * * *',$$SELECT public.delete_expired_session_data();$$);
```

Risk: low. All additive or default-only changes; one trigger function replaced.

---

## 8. Edge Function Change Plan

| Function | Change |
|---|---|
| `_shared/cors.ts` | Whitelist origins (P0-8) |
| `_shared/gemini.ts` | Keep; remove any Claude/OpenAI fallback paths |
| `_shared/rateLimit.ts` | **New** token-bucket helper, used by hint/answer/debrief |
| `generate-hint` | Apply rate limit; ensure deduct_credits called via RPC; return `{hint, balance}` |
| `generate-answer` | Same + STAR template enforcement |
| `generate-debrief` | Read `session_transcripts` + `session_answers`; persist scores |
| `stripe-webhook` | Map `plan_id`, reset monthly credits on `invoice.payment_succeeded`; verify signature |
| `delete-account` | **New** — purge profile (cascade), storage objects |
| `export-transcripts` | **New** — CSV → `exports` bucket → signed URL |
| `send-digest` | **New** cron (or disable at launch) |
| `parse-resume` | Confirm writes `resume_versions.parsed_data`; multi-layer fallback already memoed |
| `get-deepgram-token` | Confirm 60s TTL |
| Deleted: `schedule-interview` (already removed) |

---

## 9. Frontend / Route / Component / Hook / Store Changes

Routes removed: `/app/mock-test/*`, `/app/settings/byok`.
Routes reframed: `/app/live/*` (practice banner).
Sidebar (`AppSidebar.tsx`): drop Mock Test, BYOK entries.
Stores: `overlayStore` (drop `stealth_mode`, `active_model` collapses to gemini); `userStore` no behavior change.
Hooks: `useStealthMouse`, `usePrivateMode` (if covert) — delete; `useLiveCopilot` — add policy disclaimer state; `useCredits` — low-balance toast; `useConfidenceScore` — read `v_user_readiness`.
Components: `CreditBalance` ∞ rendering; `PricingCard` reads `PLANS` constant; `OAuthButton` Google-only.

---

## 10. Duplicate / Legacy / De-Scope Plan

- **Delete**: `src/lib/stealth/*`, `screenCaptureEvasion.ts`, `stealthMouse.ts`, `useStealthMouse.ts`, `byokVault.ts`, `SettingsBYOK.tsx`, `docs/STEALTH_FEATURES.md`, duplicate settings pages.
- **De-scope (keep tables, remove UI)**: mock-test pages, cover letter, multi-model UI, non-Google OAuth, BYOK.
- **Deprecate carefully**: `usePrivateMode` (review before delete).
- **Keep**: sessions, debriefs, prep tools, company research, audio pipeline, analytics, gamification.

---

## 11. Manual / Pricing / Privacy / Docs Rewrite Plan

| Doc | Action |
|---|---|
| Manual ch.6 (Stealth) | **Delete chapter** |
| Manual ch.8.1 (Live Co-Pilot) | Rewrite: "Practice with live AI coach. Not for use during real interviews." |
| Manual ch.8.2 (Models) | Rewrite: "Powered by Google Gemini 2.0 Flash." |
| Manual ch.8.3 (Capture evasion) | **Delete** |
| Manual ch.8.5 (BYOK) | "BYOK on roadmap — not in v1." |
| Manual ch.11 (Pricing) | Free 200 / Pro $29 2000 / Enterprise $79 unlimited |
| Manual ch.13 (Security/Privacy) | Remove AES-256-BYOK & E2E-recording claims; describe actual posture (Supabase RLS, 90d retention, Gemini processor) |
| `docs/STEALTH_FEATURES.md` | Delete |
| `docs/QA_MANUAL.md` | Regenerate from new manual |
| `src/pages/marketing/Privacy.tsx`, `Terms.tsx` | Sync to manual ch.13 |
| `src/pages/marketing/Landing.tsx`, `Pricing.tsx` | Remove stealth/multi-model language |
| `README.md`, `replit.md` | Remove stealth references |

---

## 12. Regression Risk Matrix

| Change | Risk | Mitigation |
|---|---|---|
| Stealth removal | Overlay window behaviour changes (now visible, in taskbar) | Communicate as feature change; manual QA on macOS/Win |
| Credit default 50→200 | Existing users keep current balance (only default changes) | Migration touches default only; no UPDATE of existing rows |
| Mock-test route removed | Bookmarked URLs 404 | Add 301 redirect to `/app/dashboard` in `NotFound.tsx` route map |
| Model collapse to Gemini | Users with non-gemini preference | One-time migration `UPDATE profiles SET preferred_model='gemini-2.0-flash'` (guarded by enum cast) |
| CORS whitelist | Dev tooling from other origins blocked | Include localhost:5173, preview domain |
| pg_cron retention | Could delete data unexpectedly | Function honours `data_retention_days`; default 90; emit notification before purge in P2 |
| BYOK page removal | Users mid-setup | Show banner: "BYOK temporarily unavailable" for 7 days, then remove |

---

## 13. Verification Steps for Every Fix

Each P0 has explicit verify column in §2. Generic checklist applied per PR:

1. `rg` for forbidden tokens (per fix).
2. `bunx vitest run` green.
3. `npm run build` green (harness).
4. Manual smoke: signup → onboarding → start session → request hint (credits decrement) → end session → debrief renders → analytics updates → logout.
5. Edge fn: `supabase--curl_edge_functions` for changed function returns expected JSON.
6. SQL: `psql -c "SELECT ..."` confirms migration applied.
7. Screen-share test (P0-1, P0-7): screen-share to second device, overlay must be visible.

---

## 14. QA / Automation / Release Checklist

**Pre-merge per PR**: lint, vitest, build, no `@ts-nocheck` added, no `console.log` left, security scan green.

**Pre-release (RC build)**:
- All P0 closed.
- Playwright smoke suite green (signup, session, billing).
- Stripe test-mode: subscribe Pro → 2000 credits applied; cancel → downgrade at period end.
- Retention cron dry-run.
- Privacy/Terms reviewed by legal (Path A) or held back (Path B).
- Manual ch.6/8/11/13 rewritten and re-uploaded.

**Post-deploy**:
- Smoke real signup on prod.
- Watch edge-function logs 24h.
- Watch Stripe webhook deliveries.
- Monitor `request_metrics` p95 latency.

**Rollback**: revert via Lovable history; DB migration is additive (forward-only safe); if needed, run `ALTER TABLE profiles ALTER COLUMN credits SET DEFAULT 50;` reversal.

---

## 15. Final Safe Rollout Order

**Sprint 1 (week 1) — Compliance & Truth**
1. P0-1 stealth removal (biggest diff; do first, on its own branch).
2. P0-7 manual screen-share verification.
3. P0-10 Live page reframe + disclaimer.
4. P0-9 Privacy/Terms rewrite.
5. P0-5 BYOK removal.
6. P0-4 model collapse to Gemini.
7. Manual ch.6/8 rewrite published.

**Sprint 2 (week 2) — Billing & Domain**
8. P0-2 + P0-3 pricing/credits unification (migration + constants + Stripe).
9. P0-6 mock-test de-scope.
10. P0-8 CORS whitelist.
11. P1-1..P1-3 readiness score, low-credit warning, ∞ rendering.
12. P1-6..P1-8 onboarding propagation, resume context, STAR→AnswerBank.

**Sprint 3 (week 3) — Reliability & Hardening**
13. P1-4 retention cron live.
14. P1-9 debrief consumes real data.
15. P1-10 delete-account cascade.
16. P1-11 rate limiting.
17. P1-12 exports.
18. P2 polish items.

**Launch gate**: all P0 + P1 closed, QA checklist green, legal sign-off on rewritten manual & privacy.

---

End of execution plan. Approve to begin Sprint 1 step 1 (P0-1 stealth removal) — that's the single largest, most de-risking change and should ship in isolation.
