# Clarify AI — Production Audit (2026-05-25)

Full-stack production audit with in-repo fixes applied. Supersedes partial runs in `PRODUCTION_AUDIT_2026-05-03.md`.

---

## 1. Repo feature map (documented → implementation)

| Area | Routes / entry | Backend | Status |
|------|----------------|---------|--------|
| Auth | `src/pages/auth/*`, `ProtectedRoute` | Supabase Auth | **WORKING** |
| Onboarding (5 steps) | `src/pages/onboarding/*` | `profiles` | **WORKING** |
| Dashboard | `/app/dashboard` → `Dashboard.tsx` | `profiles`, `sessions`, gamification hooks | **WORKING** |
| Live co-pilot | `/app/live`, overlay | `start-session`, `generate-answer`, `deepgram-token` | **WORKING** (requires env keys) |
| Mock interview | `/app/mock/*` | `generate-questions`, session tables | **WORKING** (requires AI keys) |
| Mock test (MCQ) | `/app/mock-test/*` | `create-test`, `submit-test`, etc. | **WORKING** |
| Prep Lab | `/app/prep/*` | `prep-tool`, `polish-star-section` | **WORKING** (requires AI keys) |
| Documents / resume | `/app/documents/*` | Storage + `parse-resume` | **WORKING** |
| Interviews / calendar | `/app/interviews/*` | `schedule-interview`, `sync-calendar` | **PARTIAL** — Google OAuth env required |
| Practice rooms | `/app/rooms/*` | `practice_rooms` + chat | **PARTIAL** — chat only; WebRTC not shipped (labeled beta) |
| Analytics | `/app/analytics` | `analytics-dashboard` EF | **WORKING** (server aggregates improved this audit) |
| Billing | Settings billing, Stripe EFs | `create-checkout`, `stripe-webhook` | **PARTIAL** — needs `STRIPE_*` secrets |
| Settings / GDPR | Settings data & danger | `export-user-data`, `delete-account` | **WORKING** (auth-only user id) |
| Marketing | `/`, `/pricing`, etc. | Static | **WORKING** — no fake user-count stats |
| Compliance: capture evasion | overlay / electron / stealth | — | **DISABLED FOR COMPLIANCE** |

---

## 2. Issue register (fixes applied this session)

| Severity | Issue | Root cause | Fix | Files |
|----------|-------|------------|-----|-------|
| P0 | Screen-capture evasion / panic-hide paths | Covert-assistance behaviour | Gated/disabled; honest UI copy; inert Electron stealth API | `featureGates.ts`, `stealthActions.ts`, `electronBridge.ts`, `electron/preload.ts`, `ScreenCaptureBlocker.tsx`, `AppTopBar.tsx`, `LivePanicButton.tsx` |
| P0 | XP/badges not persisted | Calls to non-existent `award-xp` / `unlock-badge` EFs | Direct `profiles` + `user_badges` writes | `useGamification.ts`, `useXPSystem.ts` |
| P1 | Export/delete IDOR surface | Client-sent `user_id` | Server uses JWT user id only | `export-user-data`, `delete-account`, `SettingsDanger.tsx`, `SettingsData.tsx` |
| P1 | Analytics incomplete / wrong fetch | Raw fetch + TODO aggregates in EF | `fetchEdgeJson` + filler trend, radar, deltas | `useAnalytics.ts`, `analytics-dashboard/index.ts`, `Analytics.tsx` |
| P2 | Practice rooms misleading | No WebRTC | Beta banner + honest copy | `PracticeRooms.tsx` |
| P2 | Broken XP on document upload | Dead `award-xp` call | Removed dead call | `useDocuments.ts` |

---

## 3. Compliance — disabled features

The following are **not** improved; they are **disabled or reframed**:

- OS `setContentProtection` / `WDA_EXCLUDEFROMCAPTURE` (Electron IPC removed from preload)
- `screenCaptureEvasion.ts` active hiding (already no-op; preserved)
- `screenCaptureBlocker.ts` enable paths (no-op; UI now says awareness only)
- Ctrl+Shift+P panic **hide** (removed from Electron main per P0-2)
- Marketing “stealth invisible on screen share” claims — product uses **Discrete UI** (label rename only)

**Calm steps** (formerly “Panic”) remains: deterministic coaching copy only (`PANIC_RESPONSE`), does not hide the overlay.

To re-enable capture features: set `SCREEN_CAPTURE_EVASION_ENABLED` in `featureGates.ts` **and** obtain legal approval + `VITE_COMPLIANCE_STEALTH_APPROVED=true`.

---

## 4. Production checklist (summary)

| Feature | Status |
|---------|--------|
| A. Auth / onboarding | WORKING |
| B. Dashboard / nav | WORKING |
| C. XP / streaks | WORKING (fixed persistence) |
| D. Credits | WORKING (needs Stripe for paid) |
| E. Documents | WORKING |
| F. Prep tools | WORKING (needs AI keys) |
| G. Interview scheduling | PARTIAL (Google Calendar env) |
| H. CSV/Excel questions | WORKING |
| I. Mock sessions | WORKING |
| J. Audio / Deepgram | PARTIAL (needs `DEEPGRAM_API_KEY`) |
| K. Realtime / network | WORKING (existing retry patterns) |
| L. AI / BYOK | PARTIAL (provider keys) |
| M. Screenshot / capture | DISABLED FOR COMPLIANCE |
| N. Debrief | WORKING |
| O. Analytics | WORKING |
| P. Billing | PARTIAL (Stripe secrets) |
| Q. Settings / privacy | WORKING |
| R. Export / delete | WORKING |
| S. Security / RLS | WORKING (export/delete hardened) |
| T. Public pages | WORKING |
| U. Responsiveness | WORKING (ongoing per-page QA) |
| V. Performance | PARTIAL (manual perf pass recommended) |
| W. Error handling | IMPROVED (analytics retry UI) |

---

## 5. Manual setup before release

1. Supabase: deploy Edge Functions; set `GEMINI_API_KEY`, `DEEPGRAM_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, Google OAuth for calendar.
2. Enable **Leaked Password Protection** in Supabase Auth.
3. Run `npm run build` and `npm test` locally (CI environment).
4. Smoke-test: signup → onboarding → mock session → debrief → analytics.
5. Verify overlay is **visible** in a screen-share test (compliance).

---

## 6. Files changed (this audit)

- `src/lib/compliance/featureGates.ts` (new)
- `src/lib/stealth/stealthActions.ts`
- `src/lib/stealth/electronBridge.ts`
- `electron/preload.ts`
- `src/components/layout/AppTopBar.tsx`
- `src/components/overlay/ScreenCaptureBlocker.tsx`
- `src/components/live/LivePanicButton.tsx`
- `src/hooks/useGamification.ts`
- `src/hooks/useXPSystem.ts`
- `src/hooks/useAnalytics.ts`
- `src/hooks/useDocuments.ts`
- `src/pages/app/Analytics.tsx`
- `src/pages/app/rooms/PracticeRooms.tsx`
- `src/pages/app/settings/SettingsDanger.tsx`
- `src/pages/app/settings/SettingsData.tsx`
- `supabase/functions/analytics-dashboard/index.ts`
- `supabase/functions/export-user-data/index.ts`
- `supabase/functions/delete-account/index.ts`
- `docs/PRODUCTION_AUDIT_2026-05-25.md` (this file)
