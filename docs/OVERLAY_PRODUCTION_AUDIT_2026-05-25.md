# Overlay Production Audit — 2026-05-25

Transparent, consent-based AI overlay audit (Phases 0–11). Screen-capture evasion remains **disabled** via `SCREEN_CAPTURE_EVASION_ENABLED` in `src/lib/compliance/featureGates.ts`.

---

## 1. Feature map

| Feature | Supporting files | Backend / service | Status |
|--------|------------------|-------------------|--------|
| Live overlay shell | `OverlayWindow.tsx`, `overlayStore.ts` | — | **working** (fixes applied) |
| Compliance disclosure | `OverlayComplianceBanner.tsx`, `ScreenCaptureBlocker.tsx` | — | **FIXED** |
| Discrete UI (opacity) | `StealthMouseGuard.tsx`, `stealthActions.ts` | — | **FIXED** (no double-opacity; honest copy) |
| Corner-snap layout | `OverlayPositionManager.tsx`, `stealthMouse.ts` | — | **working** (decoupled from discrete UI) |
| Hotkeys | `OverlayKeyboardHandler.tsx`, `hotkeys.ts` | — | **FIXED** (removed duplicate `hotkeyManager` in `useLiveCopilot`) |
| Live transcription | `LiveTranscriptStream.tsx`, `useAudioSession.ts`, Deepgram | Edge / Deepgram | **working** (needs live API keys) |
| AI hints / cards | `OverlayHintPanel.tsx`, `useLiveCopilot.ts` | `generate-hint`, Gemini | **working** |
| Pre-session quick start | `OverlayQuickStart.tsx`, `PreSessionSetupWizard.tsx` | docs store | **working** |
| Overlay settings panel | `OverlaySettings.tsx` | `profiles` (position) | **FIXED** (wired in toolbar) |
| Screen-share notice | `ScreenCaptureBanner` in `OverlayWindow.tsx` | events | **FIXED** (no “Enable Stealth”) |
| Calm coaching steps | `PANIC_RESPONSE`, toolbar | `sessionStore.triggerPanic` | **FIXED** (renamed copy) |
| Capture evasion | `screenCaptureEvasion.ts`, `electronBridge` | — | **DISABLED FOR COMPLIANCE** |
| PiP overlay | `useDocumentPiP.ts` | — | **missing** (`false`) |
| Window auto-hide on blur | `WindowVisibilityManager.tsx` | — | **missing** (not mounted) |
| Electron dedicated overlay route | `electron/main` | — | **NEEDS MANUAL TEST** |
| Session debrief / history | `SessionDebrief`, library pages | Supabase sessions | **NEEDS MANUAL TEST** |
| Orphan live mock page | `live/MockSession.tsx` | — | **FIXED** (re-export to `mock/MockSession`) |

---

## 2. Start-to-end user journey audit

| Phase | Route / entry | Status | Notes |
|-------|---------------|--------|-------|
| Onboarding | App onboarding, settings reset | **NEEDS MANUAL TEST** | Pre-session wizards use compliant “discrete UI” copy |
| Pre-session | `/app/live`, `PreSessionSetupWizard` | **PASS** | Templates, context attach |
| Launch overlay | `/app/live/overlay`, mock session | **FIXED** | Fast portal mount; disclosure banner |
| Live session | `useLiveCopilot` + `OverlayWindow` | **FIXED** | Hotkeys, mute, discrete UI |
| Recovery | `OverlayNetworkBadge`, audio reconnect | **NEEDS MANUAL TEST** | |
| Debrief | Post-session flows | **NEEDS MANUAL TEST** | |
| History | Session library | **NEEDS MANUAL TEST** | RLS assumed |
| Settings | `OverlaySettings` + app settings | **FIXED** | Panel wired; privacy prefs in profile |

---

## 3. Issue register (fixes this pass)

| Sev | Impact | Root cause | Files | Fix |
|-----|--------|------------|-------|-----|
| P0 | Misleading “stealth” / hide from capture | Legacy copy + banner CTA | `OverlayWindow`, `OverlayToolbar`, `OverlaySettings` | Renamed DISCRETE/CORNER; removed Enable Stealth; added `OverlayComplianceBanner` |
| P0 | Duplicate Ctrl+Shift+H handlers | `hotkeyManager` + `OverlayKeyboardHandler` | `useLiveCopilot.ts` | Removed `hotkeyManager.register()` |
| P1 | Double opacity in discrete UI | Panel + guard both dimmed | `OverlayWindow.tsx` | Guard owns opacity when discrete UI on |
| P1 | Proctor-safe auto-enabled with stealth | Coupled in session setup | `LiveOverlay`, `LiveRehearsal`, `MockSession` | `setProctorSafe(false)` by default |
| P1 | Overlay settings unused | Not in toolbar | `OverlayToolbar.tsx` | Wired `OverlaySettings` panel |
| P2 | Mute hotkey in manager broken | Wrong store API | `hotkeys.ts` | Uses `audioStore` mic tracks |
| P2 | Orphan duplicate mock | Unrouted file | `live/MockSession.tsx` | Re-export to canonical mock session |
| P2 | Screen capture banner gated wrong | Required `isProctorSafe` | `OverlayWindow.tsx` | Shows on any detection; honest message |

---

## 4. UX improvement plan (prioritized)

1. **Mount `WindowVisibilityManager`** behind explicit user toggle (auto-hide is sensitive).
2. **Enable Document PiP** behind consent + “visible assistant” notice.
3. **Pre-session templates** — save/load session presets in Supabase.
4. **Transcript virtualization** for 60+ minute sessions.
5. **Onboarding replay** from Settings → “Restart overlay tour”.
6. **Electron** — load `/app/live/overlay` in transparent window with visible frame indicator.

---

## 5. Final release checklist

| Item | Status |
|------|--------|
| No screen-capture evasion | **DISABLED FOR COMPLIANCE** |
| Visible disclosure in overlay | **FIXED** |
| No “Enable Stealth” on capture detect | **FIXED** |
| Hotkey conflicts resolved | **FIXED** |
| Discrete UI honest labeling | **FIXED** |
| Settings panel wired | **FIXED** |
| Proctor-safe decoupled from stealth | **FIXED** |
| Live transcription E2E | **NEEDS MANUAL TEST** |
| Debrief export | **NEEDS MANUAL TEST** |
| Electron overlay | **NEEDS MANUAL TEST** |
| PiP / auto-hide | **missing** (deferred) |
| `npm run build` | **NEEDS MANUAL TEST** (install deps locally) |

---

## Compliance policy (summary)

- **Allowed:** practice interviews, coaching, note-taking, meeting support (with consent), learning.
- **Not allowed:** hiding from screen share, proctoring, or recordings; anti-capture; panic-hide.
- **Discrete UI:** opacity reduction only; remains visible when shared.
- **Corner snap:** layout preset only; user-enabled in settings.
