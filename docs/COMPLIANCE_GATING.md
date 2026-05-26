# Compliance gating — overlay and capture features

## Policy

Clarify AI must **not** help users conceal the assistant from interviewers, proctors, or screen-sharing tools. Features that hide UI from capture, auto-evade monitoring, or panic-hide the overlay are **disabled in production**.

## Feature flags

| Flag | Location | Default | Notes |
|------|----------|---------|-------|
| `SCREEN_CAPTURE_EVASION_ENABLED` | `src/lib/compliance/featureGates.ts` | `false` | Must stay false unless legal approves |
| `VITE_COMPLIANCE_STEALTH_APPROVED` | env | unset | Required to enable any evasion code paths |

## Disabled / no-op modules

- `src/lib/overlay/screenCaptureEvasion.ts` — no-op exports
- `src/lib/stealth/screenCaptureBlocker.ts` — no-op
- `src/lib/stealth/electronBridge.ts` — no capture exclusion IPC
- Electron `Ctrl+Shift+P` panic-hide — removed (P0-2)

## Allowed (legitimate UX)

- **Discrete UI** — opacity/theme adjustments; overlay **remains visible** on screen share
- **Compliance banner** — `OverlayComplianceBanner.tsx` always discloses visibility
- **Screen capture detection** — warning only; does not hide content
- **Calm coaching steps** — `LivePanicButton` / mock calm panel — grounding prompts, not UI hiding
- **Toggle overlay visibility** — user minimizes window (same as any app); not marketed as evasion

## Re-enable procedure (admin/legal only)

1. Written legal approval recorded
2. Set `VITE_COMPLIANCE_STEALTH_APPROVED=true` in controlled environment only
3. Set `SCREEN_CAPTURE_EVASION_ENABLED` via approved build flag
4. Update this document and `QA_MANUAL.md`
5. Re-run compliance QA before any public release

## Mock interview note

Mock session **calm mode** shows coaching steps in-panel. It does **not** blank the screen to hide from others.
