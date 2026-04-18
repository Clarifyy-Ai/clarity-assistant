

The user wants a master audit and fix prompt for Clarify AI. The 46-issue prompt has already been fully implemented over the previous sessions (Batches 1-12 complete, plus the 7 remaining fixes 3, 17, 31, 37, 38, 39, 41 in the last loop).

Now they're asking again — but this is the SAME prompt that was just completed. Before re-running fixes, I need to actually verify the current state by running through the 4 acceptance journeys and identifying what's STILL broken vs. what's now working. The user explicitly says "so many features are not working properly, overlay not working visible was not properly working, there are many issues" — meaning despite past fixes, real problems remain in production.

I should present a focused **verification + targeted re-fix plan** rather than re-running 46 fixes blindly.

## Plan

# Clarify AI — Targeted Re-Audit & Fix Plan

The 46-issue master prompt has already been implemented across prior sessions. Re-running the entire pass would overwrite already-fixed code and waste effort. Instead, I'll **verify each acceptance journey against the current codebase**, identify what's actually still broken, and fix only the real regressions.

## Phase 1 — Live Verification (read-only audit)

For each of the 4 acceptance journeys, inspect the current code path end-to-end and log actual defects:

1. **Mock Interview Journey** — verify `MockSession.tsx` → `generate-questions` EF wiring → `session_answers` insert → navigation to `/app/sessions/:id`
2. **Live Co-Pilot Journey** — verify mic permission gate → `deepgram-token` fetch → WebSocket connect → transcript stream → hint generation in overlay
3. **Stealth Mode Journey** — verify `screenCaptureEvasion.ts` real protection (not just CSS) → `WarningBanner` tier display
4. **Auth Journey** — verify OAuth redirect target → back-button blank screen → tab-resume token refresh

Tools used: `code--view`, `code--search_files`, `supabase--read_query` (check actual `session_answers` rows from recent sessions), `supabase--edge_function_logs` (check `generate-questions` for timeouts/errors), `supabase--linter` (DB security state).

## Phase 2 — Overlay Deep Dive (the user's #1 complaint)

Specifically inspect:
- `OverlayWindow.tsx` — confirm CSS opacity toggle is active (no conditional unmount)
- `useOverlayVisibility.ts` + `OverlayKeyboardHandler.tsx` — confirm Ctrl+Shift+H actually toggles `is_visible` during a real session
- `OverlayPositionManager.tsx` — confirm position persists across re-renders and touch events fire on mobile
- `overlayStore.ts` — confirm `is_visible` defaults and persistence behavior
- Check whether the overlay is actually mounted on `LiveOverlay.tsx` / `MockSession.tsx` / `LiveRehearsal.tsx` routes

## Phase 3 — Categorize Findings

Output a delta report:
- **Confirmed fixed** (no action)
- **Regressed** (was fixed, broken again — re-fix)
- **Never actually fixed** (prompt claimed fix but code shows otherwise — fix now)
- **New issues discovered** (not in original 46 — fix now)

## Phase 4 — Targeted Fix Pass

Apply only the fixes for items in categories 2/3/4 above. Each fix gets a one-line acceptance check.

## Phase 5 — Browser QA

Once fixes land, use browser tools to actually exercise:
- Mock session start → question render → end → scorecard
- Overlay Ctrl+Shift+H toggle on `/app/live`
- Mobile viewport (360px) for overlay bottom-sheet behavior

## Why this approach (not re-running the 46-issue prompt)

- Re-applying already-implemented fixes risks introducing regressions
- The user's complaint ("overlay not visible properly, many issues") suggests **specific** broken paths, not a global breakdown
- Reading the actual current state takes ~10 file reads vs. 46 blind re-edits
- Final fix list will be small, focused, and verifiable

## Out of scope for this plan

- New features
- Performance load testing (1000 concurrent users) — requires staging infra
- Penetration testing — requires explicit authorization

Once you approve, I'll switch to default mode, run the verification phase, share the delta report, and apply targeted fixes.

