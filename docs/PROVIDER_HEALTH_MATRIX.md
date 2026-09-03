# Provider health matrix (certification gate)

Lightweight readiness checklist for production GO. Update after each deploy / smoke.

| Provider / surface | Config source | Probe | User-facing failure mode | Status |
|--------------------|---------------|-------|--------------------------|--------|
| Supabase Auth | Project Auth URL + redirects | Sign-in / reset-password deep link | Friendly auth errors | Needs live UAT |
| Supabase Edge | Secrets + `config.toml` JWT | `ping`, authenticated EF | Toast / inline retry | Partial — redeploy `assemble-assessment` JWT |
| Gemini / AI router | Edge secrets | Live AI Help / mock hint | Provider unavailable copy | Needs smoke |
| Deepgram STT | Edge token EF | Live overlay listen | `audio_unavailable` + Chat nudge | Needs UAT |
| Razorpay | Billing settings + secrets | Create-order → verify → webhook | Checkout errors / reconciliation incidents | Ledger code ready; sandbox smoke open |
| Python document worker | Render / Edge Python URL | Library upload durable job | Job failed + retry | Library path OK |
| Support chat | CORS + `ALLOW_PREVIEW_ORIGINS` | Widget connect | Retry connection | Fixed for preview CORS |

## GO criteria (all must pass)

1. No public JWT-off on authenticated product EFs (except intentional webhooks / guest support).
2. Razorpay one-time path: order → verify → credit/plan grant with empty open incidents after success.
3. Live Overlay: listen → AI Help → Chat continuity; mute → Chat attention. Automated contracts + mocked e2e; interactive mic/share still CONDITIONAL.
4. Dashboard and Analytics session counts exclude soft-deleted sessions.
5. Capture / presentation-safe copy does not claim universal invisibility.
6. Debrief generation is durable (job table + 202 + poll; cancel releases credits).

## Current gate

**NO_GO** (2026-09-03) — Phases 2–7 + durable debrief landed in repo; deploy migration/EFs and complete interactive mic UAT + Razorpay smoke.

See also: `docs/MASTER_PROMPT_PHASES_2_7.md`, `docs/OVERLAY_UAT.md`, `IMPLEMENTATION_LEDGER.md` (`SEP03-P2P7`, `SEP03-DEBRIEF-JOB`).
