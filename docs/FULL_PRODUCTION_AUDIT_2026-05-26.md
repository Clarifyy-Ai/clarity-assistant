# Full Production Audit — 2026-05-26

Master audit pass building on [FULL_PRODUCTION_AUDIT_2026-05-25.md](./FULL_PRODUCTION_AUDIT_2026-05-25.md). This document tracks **feature map**, **issue register**, and **release status**.

---

## 1. Repo feature map (A–W summary)

| ID | Area | Routes | Key files | Backend | Status |
|----|------|--------|-----------|---------|--------|
| A | Auth / onboarding | `/login`, `/signup`, `/onboarding` | `src/pages/auth/*`, `ProtectedRoute.tsx` | Supabase Auth | WORKING |
| B | Dashboard / shell | `/app/dashboard` | `Dashboard.tsx`, `AppShell` | `profiles`, RPCs | WORKING |
| C | XP / streaks | Dashboard widgets | `gamification` lib, migrations | RPCs | WORKING |
| D | Credits | Usage, overlay | `creditsManager.ts`, `deduct-credits` | Edge + ledger | WORKING |
| E | Documents | `/app/documents` | `Documents.tsx`, `useDocuments.ts` | `parse-resume`, `parse-document` | WORKING |
| F | Prep tools | `/app/prep/*` | PrepLab + tools | `prep-tool`, `generate-star-answer` | WORKING |
| G | Interviews | `/app/interviews/*` | `NewInterview.tsx` | DB + `schedule-interview` EF | WORKING (needs edge deploy) |
| H | Question upload | `/app/mock-test/upload` | `UploadQuestions.tsx` | `parse-question-pdf` | WORKING |
| I | Mock sessions | `/app/mock/*` | `MockSession.tsx` | `generate-questions` | WORKING |
| J | Audio / STT | Live overlay | `useAudioSession`, Deepgram | `deepgram-token` | WORKING |
| K | Realtime | Rooms, notifications | `RoomSession.tsx` | Supabase Realtime | WORKING (chat + presence MVP) |
| L | AI generation | Live / mock | `useLiveCopilot`, `modelRouter` | `generate-hint`, `generate-answer` | WORKING (needs edge redeploy) |
| M | Screenshot / capture | Overlay | `ScreenCaptureBlocker` | N/A | DISABLED FOR COMPLIANCE (evasion) |
| N | Debrief | `/app/debrief/*` | `DebriefDetail.tsx` | `generate-debrief` | WORKING (fixed `fetchEdgeJson`; needs redeploy) |
| O | Analytics | `/app/analytics` | `Analytics.tsx` | `analytics-dashboard` | WORKING |
| P | Billing | Settings billing, pricing | Stripe pages | `create-checkout`, `stripe-webhook` | PARTIALLY WORKING (Stripe secrets) |
| Q | Settings / privacy | `/app/settings/*` | Settings pages | `profiles`, Supabase MFA | WORKING |
| R | Export / delete | Settings data/danger | `SettingsData`, `SettingsDanger` | `export-user-data`, `delete-account` | WORKING |
| S | Security / RLS | All | migrations, edge auth | RLS + JWT | WORKING |
| T | Marketing | `/`, `/pricing`, etc. | `src/pages/marketing/*` | Static | WORKING (fake stats removed) |
| U | Responsive / a11y | All | overlay, settings | N/A | WORKING |
| V | Performance | Dashboard, charts | lazy routes | N/A | PARTIALLY WORKING |
| W | Error handling | Global | `fetchEdge.ts`, boundaries | Edge errors | WORKING |

See [COMPLIANCE_GATING.md](./COMPLIANCE_GATING.md) for overlay safety flags.

---

## 2. Issue register

| ID | Sev | Issue | Root cause | Files | Fix | Status |
|----|-----|-------|------------|-------|-----|--------|
| I-01 | P0 | Live AI Help empty | CORS on Lovable preview; coach context fallback | `useLiveCopilot.ts`, `_shared/cors.ts` | Lovable origin allowlist; `getContext() ?? getSafeContext()` | FIXED |
| I-02 | P0 | `generate-debrief` CORS / empty debrief | Remote edge not redeployed; wrong `fetchEdge` usage | `cors.ts`, `DebriefDetail.tsx` | `fetchEdgeJson` + redeploy | FIXED (code) |
| I-03 | P0 | Migrations not on remote | Ops gap | `20260525*` migrations | `npx supabase db push` | MANUAL (ops) |
| I-04 | P1 | Fake auth stats 87%/50k+ | Hardcoded marketing | `Login.tsx`, `Signup.tsx` | Product-accurate copy | FIXED |
| I-05 | P1 | MockSession panic blank screen | Full-page hide UX | `MockSession.tsx` | Calm coaching panel | FIXED |
| I-06 | P1 | Stale panic hotkey copy | Legacy stealth docs | `hotkeys.ts`, `errors.ts`, `QA_MANUAL.md` | Updated descriptions | FIXED |
| I-07 | P2 | Settings model picker stub | Not wired | `SettingsModels.tsx` | Flash/Pro picker → profile | FIXED |
| I-08 | P2 | 2FA coming soon | Not implemented | `SettingsSecurity.tsx` | Supabase MFA enroll/verify | FIXED |
| I-09 | P2 | No schedule-interview EF | Missing function | `schedule-interview/`, `NewInterview.tsx` | New edge + notification + email | FIXED |
| I-10 | P2 | Integrations badges only | OAuth secrets missing | `SettingsIntegrations.tsx` | Env-gated OAuth + Calendar connect | FIXED |
| I-11 | P2 | Rooms voice/video missing | WebRTC not built | `RoomSession.tsx`, `PracticeRooms.tsx` | Realtime chat/presence + honest UX | FIXED |
| I-12 | P2 | Raw `functions.invoke` in pages | Inconsistent network layer | MockSession, Documents, Debrief, Integrations | Standardized P0 paths on `fetchEdgeJson` | FIXED (P0 paths) |
| I-13 | P0 | Interviewer audio not transcribed | Mic-only default; silent tab-capture fallback | `LiveOverlay.tsx`, `useAudioSession.ts`, `audioCapture.ts` | Tab audio default on; guided share UX; mono mix; status badge | FIXED |
| I-14 | P0/P1 | Overlay layout / recovery pill blocked | Full-header drag; StealthMouseGuard always interactive | `OverlayWindow.tsx`, `StealthMouseGuard.tsx`, `stealthMouse.ts` | Split header/toolbar; pointer-events fix; inset resize handles | FIXED |
| I-15 | P0 | Mock exam Gemini / empty bank | Legacy Gemini model; gap-fill swallowed; exam_type mismatch | `parse-question-pdf`, `select-test-questions`, `AdminSeedQuestions.tsx` | Shared `geminiGenerate`; CORS `req`; gap_fill_failed UX; normalize exam_type | FIXED (code) |
| I-16 | P0 | No public exam paper ingestion | No scraper edge function | `collect-exam-papers/`, `AdminSeedQuestions.tsx` | Admin allowlisted scraper + Collect UI | FIXED (code) |
| I-17 | P0 | Prep tool CORS / double credit charge | Edge responses omit `req`; StarBuilder client deduct | `prep-tool`, `polish-star-section`, `generate-star-answer`, `cors.ts`, `StarBuilder.tsx` | Pass `req` on all responses; BYOK headers; `fetchEdgeJson` | FIXED (code) |

---

## 3. Deploy checklist (manual — required before production smoke)

1. `npx supabase db push`
2. Set `ALLOWED_ORIGINS` including preview + production domains (see [DEPLOY_PRODUCTION_CHECKLIST.md](./DEPLOY_PRODUCTION_CHECKLIST.md))
3. Deploy all edge functions — run `node scripts/list-edge-functions.mjs` → [EDGE_DEPLOY_COMMANDS.txt](./EDGE_DEPLOY_COMMANDS.txt)
4. Secrets: `GEMINI_*`, `DEEPGRAM_*`, `STRIPE_*`, `SYSTEM_USER_ID`, `RESEND_API_KEY` (optional email)
5. Lovable preview rebuild from `main`
6. Smoke both origins: signup → live AI Help → debrief → mock test → cover letter

---

## 4. Fixes applied (2026-05-26 pass)

| Area | Change |
|------|--------|
| Compliance | MockSession calm panel; hotkey/error copy; `COMPLIANCE_GATING.md`; QA manual updated |
| Auth | Removed unverifiable 87%/50k+ statistics |
| Settings | Model picker (Gemini Flash/Pro); MFA enrollment UI |
| Interviews | `schedule-interview` edge function + client wiring |
| Integrations | Google Calendar live connect; OAuth env-gated cards for LinkedIn/GitHub/Slack |
| Rooms | Realtime presence cleanup on unmount; honest capability matrix |
| Live copilot | Coach context fallback fix |
| Debrief | `fetchEdgeJson("generate-debrief", { session_id })` |
| Network | P0 pages migrated from raw `invoke` to `fetchEdgeJson` |
| Deploy | `DEPLOY_PRODUCTION_CHECKLIST.md`, `EDGE_DEPLOY_COMMANDS.txt`, `list-edge-functions.mjs` |
| Live audio | Tab audio default; guided capture modal; mono mix; overlay Mic+Tab badge |
| Overlay UX | Header/toolbar split; StealthMouseGuard pointer-events; drag handle fix; minimal mode reset |
| Mock exams | `collect-exam-papers` EF; Gemini unified in parse/gap-fill; launchMockTest error UX |
| Prep tools | prep-tool / polish-star / generate-star CORS + BYOK headers; StarBuilder on `fetchEdgeJson` |

---

## 5. Release readiness summary

| Category | Verdict |
|----------|---------|
| Code in repo | **Ready** — all audit todos implemented in source |
| Supabase remote | **Action required** — run migrations + redeploy 40 edge functions (incl. `collect-exam-papers`) |
| External services | Stripe, Deepgram, Gemini required; Resend optional for email reminders |
| Compliance | Capture evasion **disabled**; documented in `COMPLIANCE_GATING.md` |
| Manual QA | Required on both `preview--clarify-aii.lovable.app` and production domains |

### Production checklist status (A–W)

| Status | Sections |
|--------|----------|
| **WORKING** | A, B, C, D, E, F, G*, H, I, J, K, L*, N*, O, Q, R, S, T, U, W |
| **PARTIALLY WORKING** | P (Stripe secrets), V (dashboard dedupe follow-up) |
| **DISABLED FOR COMPLIANCE** | M (screen capture evasion) |

\*G, L, N require Supabase edge redeploy to verify on preview/production.

### Manual test list before go-live

1. Signup → onboarding → dashboard
2. Live Co-Pilot: Deepgram transcript → AI Help → Answer + Chat populated
3. Mock test launch from Exam Papers
4. Cover letter PDF parse → visible in live session context
5. Debrief generation (no CORS console errors)
6. Schedule interview → in-app notification (+ email if Resend configured)
7. Settings: model picker persists; MFA enroll flow (if project MFA enabled)
8. Practice room: join, chat, participant list updates on leave
9. Admin user edit (admin account)
10. Billing checkout (Stripe test mode)

*Last updated: 2026-05-26*
