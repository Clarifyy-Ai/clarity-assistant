# Clarity.AI Production Hardening — Phased Plan

Per your standing rules I'm planning first, breaking this into small component-scoped passes, and adding explicit guardrails. This sprint is too large for one loop — attempting all of P0–P7 at once would risk regressing the 59 working surfaces. I'll execute one priority group per turn, you approve, we move on.

## Guardrails (apply to every phase)
- **Do not modify** any working feature outside the named files for that phase.
- **Do not touch** locked migrations, `docs/COMPLIANCE_GATING.md`, stealth shims, or memory'd "do not re-add" items (P0-2 stealth, dashboard re-add, etc.).
- **Do not** blanket-remove `@ts-nocheck` — only remove on files actually edited in the phase, and only if types compile.
- **Do not** rewrite shared utilities (`fetchEdge`, `database.ts`, `authStore`) unless the phase explicitly requires it — additive changes only.
- Every edit ships full file contents per your request; no partial diffs.

## Phase order (one per approval)

### Phase 1 — P0 Bootstrap & Dashboard
Files: `src/App.tsx`, `src/main.tsx`, `src/pages/app/Dashboard.tsx`, `src/components/common/LoadingScreen.tsx` (new `AppLoadingFallback`), `src/hooks/useGamification.ts`.
- Route-level `React.lazy` + `Suspense` for `/app/*` only; marketing eager.
- Shell-shaped skeleton fallback.
- De-dup profile/session fetch (canonical hook).
- Per-section skeletons + retry on Dashboard.

### Phase 2 — P1 Live Co-Pilot (dual-channel audio + layout)
Files: `src/lib/audio/audioCapture.ts` (or equivalent), `src/hooks/useDeepgramStream.ts`, `src/store/audioStore.ts`, `src/pages/app/live/*`, `src/components/overlay/OverlayPanel.tsx`.
- Two `MediaStream`s, two Deepgram sockets, merged labelled transcript.
- Graceful mic-only fallback + dismissible banner.
- Cleanup on unmount.
- Stable overlay layout; memoised subcomponents.

### Phase 3 — P2 Mock Interviews
Files: `src/pages/app/mock/MockSession.tsx` + related session hooks.
- Explicit state machine, cached question set, persisted session on end.

### Phase 4 — P3 Admin Exam Scraper UI
Files: `src/pages/app/admin/AdminSeed.tsx`, new `scrape_jobs` realtime subscription.
- Migration needed for `scrape_jobs` table if it doesn't exist (will surface separately for approval).

### Phase 5 — P4 Call Sessions
Files: `src/pages/app/live/*`, new `src/hooks/useCallSession.ts`.
- Single-init hook, cached device enumeration, lifecycle states.

### Phase 6 — P5 Reports / Sprint Review
Files: `src/pages/app/analytics/*`.
- Date range, real queries, CSV export.

### Phase 7 — P6 Broken Pages (sub-phased per page)
P6-A Usage → P6-B Debrief → P6-C Referrals → P6-D Documents → P6-E Knowledge Base → P6-F Calendar → P6-G Rooms → P6-H Guide → P6-I Inbox → P6-J Settings.
Each shipped individually so you can verify no regressions before moving on.

### Phase 8 — P7 Cross-cutting
`GlobalErrorBoundary`, sonner standardisation pass, `getAuthHeaders` consolidation in `src/lib/api/headers.ts`.

## Scope confirmations needed before Phase 1

1. **Confirm phased execution** — one priority group per turn, you review preview, then say "continue" for the next. (Recommended; matches your stated workflow.)
2. **Confirm Phase 4 migration** — `scrape_jobs` table likely doesn't exist; I'll propose a migration when we reach P3. OK?
3. **Audio refactor risk (Phase 2)** — dual-channel will touch `audioStore` shape. Any existing consumers (overlay pill, mock flow) will be updated in the same phase. Confirm acceptable.
4. **Skip / defer anything?** — e.g. if Sprint Review page (P5-B) doesn't exist yet, I'll note and skip rather than invent.

Reply "go" (or "go phase 1") to start Phase 1, or adjust scope.
