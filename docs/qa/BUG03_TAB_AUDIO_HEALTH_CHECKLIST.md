## BUG 03 — Manual Chrome verification checklist

Use Practice Coach / Live Overlay in Chrome or Edge.

1. Start a live session with system audio enabled.
2. Share the interview tab with **Share tab audio** ticked.
3. Status bar: Tab badge moves connecting → Tab audio (emerald) only after frames + energy or interviewer transcripts.
4. Speak on the shared tab: interviewer interim/finals appear; Audit shows Tab frames TX increasing and Last tab transcript age updating.
5. Mute the meeting / share a silent tab: after ~10s badge becomes **Tab audio silent** (amber), never emerald Active.
6. Fail STT (offline / block Deepgram): interviewer health becomes unavailable; stream is cleared on connect failure (no orphan green Tab audio).
7. Reconnect audio: status returns to connecting then active only after frames resume.
8. Console: no swallowed connect errors. Network: Deepgram WS binary frames while Active.
9. Mic-only path still works when tab share is skipped.

Remaining blocker if this environment cannot open a real meeting tab: complete steps 3–7 manually before declaring FIXED in production QA.
