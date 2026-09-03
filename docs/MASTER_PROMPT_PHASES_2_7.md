# Master-prompt phases 2–7 (incremental hardening)

Follow-on from Overlay Chat Continuity Phase 1. Certification remains **NO_GO** until runtime UAT and remaining ops items close.

## Phase 2 — Billing / security P0s

| Item | Status |
|------|--------|
| Razorpay durable `payment_orders` ledger + reconciliation incidents | Already shipped (ledger); **admin open-incident UI** added on Billing settings |
| Referral claim hardening | Already verified |
| Zombie Edge Functions → 410 stubs | Already verified |
| Init-failure cancel uses retired `end-session` | **Fixed** → `finalize-session` (`useLiveCopilot`) |
| `assemble-assessment` `verify_jwt` | **Fixed** → `true` in `supabase/config.toml` (redeploy required) |
| HIBP leaked-password Auth console | Ops-only (dashboard) — not code |

## Phase 3 — STT quality

| Item | Status |
|------|--------|
| Settings VAD → live `VADDetector` | **Wired** (`useAudioSession` reads `vad_config.noise_floor`) |
| Configurable question confidence | **Added** (`stt_question_confidence` in ui prefs + audio store) |
| AI Help transcript re-evaluate | **Added** (`aiHelpRecovery` + chat_prefill fallback). Raw PCM re-transcribe deferred (no ring buffer). |
| `hint_style` persistence | Already on Settings Practice Coach / profile |

## Phase 4 — Mock / scorecard / analytics

| Item | Status |
|------|--------|
| Wizard `tts_voice` → browser TTS | **Wired** (`speakQuestionText` + `MockSession`) |
| Scorecard null dims → “—” not `0` | **Fixed** (`mapRowToScorecard` + Scorecard UI) |
| Dashboard vs Analytics session counts | **Aligned** — dashboard `countByUserId` / recent list filter `deleted_at` like analytics |
| Durable debrief jobs | **Done** — `session_debrief_jobs` + 202/`waitUntil`; client poll/cancel; DebriefDetail wired |

## Phase 5 — Documents / assessments

| Item | Status |
|------|--------|
| Personal library durable jobs | Already in `DocumentLibrary` |
| Resume / cover letter / JD sync `parse-document` | Kept — jobs API is `personal_library_documents` only |
| Assessment JWT | Same as Phase 2 `assemble-assessment` |

## Phase 6 — Desktop honesty / a11y

| Item | Status |
|------|--------|
| Presentation-safe no longer calls `setContentProtection` | **Fixed** |
| Honest capture / protection copy | **Updated** (OverlaySettings + ScreenCaptureBlocker) |
| Skip-to-content | Already on app / marketing / admin shells |

## Phase 7 — Certification posture

| Item | Status |
|------|--------|
| Provider health matrix | See `docs/PROVIDER_HEALTH_MATRIX.md` |
| Full production GO | **NO_GO** — needs Edge redeploy (`assemble-assessment` JWT + `generate-debrief`), migration `session_debrief_jobs`, Razorpay sandbox smoke, interactive mic/share UAT |

Last updated: 2026-09-03
