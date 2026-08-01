# Overlay Architecture — Clarify AI Practice Coach

Clarify AI’s desktop coaching overlay is an **original, consent-based practice assistant**.
It is not a proctoring bypass, concealment tool, or undetectable assessment utility.

## Surfaces

| Surface | Role |
|---------|------|
| Web `/app/live/rehearsal` | Setup + post-session summary |
| Web `/app/live/overlay` | Mid-session coach UI (browser or Electron) |
| Electron (`electron/main.cjs`) | Desktop shell: CSP, restricted IPC, shortcuts, window controls |

## Security defaults

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`
- Restricted preload bridge (`electron/preload.cjs`)
- External URLs via allowlisted `shell:openExternal`
- Content protection / always-on-top are **opt-in**
- Shortcuts unregistered on `will-quit`
- No provider secrets in the client; session uses the user’s access token

## Modes

| Mode | Behavior |
|------|----------|
| Floating | Movable companion (default layout in store) |
| Docked / sidebar | Edge-attached layouts |
| Compact | Minimal status + active question |
| Presentation-safe | Explicit content-protection toggle; platform limits disclosed |
| Minimized | Timer / pause / stop indicators |

Mode changes preserve session ID, transcript, notes, timer, and credit reservation identity.

## Pipeline

1. User completes setup + responsible-use + visibility acknowledgments  
2. Server opens session + credit reservation (idempotent)  
3. Client starts capture only after user action (visible indicator)  
4. Audio → chunk → transcript → question detection → streamed guidance  
5. Pause / reconnect preserves session without double-charging  
6. End session → finalize → debrief → analytics ownership

## Ethical boundaries

- Practice, mock interviews, user-authorized coaching only  
- No process hiding, capture evasion marketing, or fabricated experience  
- Default settings favor transparency and privacy  

See also: `docs/OVERLAY_STATE_MACHINE.md`, `docs/OVERLAY_UAT.md`.
