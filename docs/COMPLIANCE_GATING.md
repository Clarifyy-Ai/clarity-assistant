# Compliance gating — overlay and capture features

## Policy

Clarify AI must **not** help users conceal the assistant from interviewers, proctors, or screen-sharing tools. Features that hide UI from capture, auto-evade monitoring, or panic-hide the overlay have been **removed** from the codebase (Phase 1 compliance hardening).

## Removed modules (not gated — deleted)

| Module | Former purpose |
|--------|----------------|
| `src/lib/overlay/screenCaptureEvasion.ts` | CSS/DOM capture evasion, `getDisplayMedia` patching, Electron content protection |
| `src/lib/stealth/screenCaptureBlocker.ts` | OS-level capture exclusion orchestration |
| `src/lib/stealth/electronBridge.ts` | Renderer bridge for capture exclusion / panic-hide IPC |
| `src/components/overlay/ScreenCaptureBlocker.tsx` | Capture detection wired to evasion paths |
| `electron/preload.ts` | Inert `electronStealth` API (unused duplicate of preload.cjs) |
| `src/hooks/useStealthMouse.ts` | Applied capture-evasion dataset flags to overlay DOM |
| `src/components/live/LivePanicButton.tsx` | Renamed/replaced by `CalmStepsButton.tsx` (coaching prompts only) |
| Electron `Ctrl+Shift+P` panic-hide | Instant overlay concealment from interviewer |
| Electron `hide-overlay` / `set-always-on-top` IPC | Renderer-driven stealth window behaviour |
| Electron `Ctrl+Shift+H` global hide/show | System-wide overlay concealment hotkey |
| `STEALTH_MODE` feature flag | Plan gate for covert capture features |
| `isStealthCaptureFeatureAllowed()` | Re-enable path for evasion after env approval |

## Active compliance gate

| Flag | Location | Default | Notes |
|------|----------|---------|-------|
| `DISCRETE_UI_LABELS_ENABLED` | `src/lib/compliance/featureGates.ts` | `true` | Renames nav labels only; does not hide from capture |

## Allowed (legitimate practice UX)

- **Discrete UI** — opacity/theme adjustments and alternate nav labels; overlay **remains visible** on screen share
- **Compliance banner** — `OverlayComplianceBanner.tsx` always discloses visibility
- **Calm coaching steps** — `CalmStepsButton` / mock calm panel — grounding prompts, not UI hiding
- **Practice overlay** — `OverlayWindow`, mock sessions, drag/snap positioning (`stealthMouse.ts` is layout-only)
- **Toggle overlay minimize** — in-app hotkey (`Ctrl+Shift+H` in renderer); same as minimizing any window; not marketed as evasion

## Mock interview note

Mock session **calm mode** shows coaching steps in-panel. It does **not** blank the screen to hide from others.

## Re-enable procedure

Covert-assistance code paths are **not** present in this branch. Any future reintroduction requires:

1. Written legal approval recorded
2. New implementation review (do not restore deleted modules verbatim)
3. Update this document and `QA_MANUAL.md`
4. Re-run compliance QA before any public release
