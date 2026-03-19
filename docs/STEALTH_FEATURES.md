# Stealth & Overlay Features

Clarity's most powerful — and sensitive — features involve the live overlay,
audio capture, and stealth mode. This document explains how they work, their
technical constraints, and responsible usage guidelines.

---

## Live Overlay (`LiveOverlay.tsx`)

The overlay is a transparent, always-on-top floating panel that appears
during a real interview. It provides real-time AI suggestions without the
interviewer seeing it.

### How It Works

```
User's screen
┌────────────────────────────────────────┐
│  Google Meet / Zoom / Teams            │
│  ┌──────────────────────────────────┐  │
│  │  Interviewer's video             │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌────────────┐  ← Clarity Overlay     │
│  │ AI Hint    │    (floating, draggable)│
│  │ Answer     │    opacity: 85%        │
│  │ Keywords   │    pointer-events: none│
│  └────────────┘    on inactive areas  │
└────────────────────────────────────────┘
```

### Activation

```typescript
// Triggered from LiveCopilot.tsx
const { activateOverlay } = useLiveSession();

// Overlay renders in a fixed-position portal
// z-index: 9999 — above all other content
// Keyboard shortcut: Ctrl+Shift+H to toggle visibility
```

### Stealth Mode

When `stealth_mode` feature flag is enabled, the overlay activates
additional concealment:

| Feature | Description |
|---|---|
| **Screenshot guard** | Renders overlay content via CSS `mix-blend-mode: screen` — invisible to most screenshot tools |
| **Reduced opacity** | Drops to 15% opacity when cursor leaves the overlay region |
| **Auto-hide** | Hides completely when the app window loses focus |
| **No window title** | Overlay window titled "System Preferences" on desktop wrappers |
| **Hotkey toggle** | `Ctrl+Shift+H` instantly hides/shows with no animation |

> ⚠️ **Important:** Stealth mode effectiveness varies by OS, browser, and
> screen-sharing software. It is provided as a best-effort feature and
> should not be relied upon as a guarantee of non-detection.

---

## Audio Capture (`audioStore.ts`)

Clarity uses the Web Audio API to capture the user's microphone in real time.

### Audio Pipeline

```
getUserMedia({ audio: true })
    ↓
MediaStream
    ↓
AudioContext → AnalyserNode → RMS level (visualiser)
    ↓
MediaRecorder (webm/opus, 16kHz)
    ↓
Blob chunks → ArrayBuffer
    ↓
Deepgram Nova-3 API (via edge function)
    ↓
Transcript + word timings
    ↓
sessionStore.transcript (real-time update)
```

### Filler Word Detection

When `filler_detection` flag is enabled, the transcript is post-processed
to identify and highlight filler words:

```typescript
const FILLERS = ["um", "uh", "like", "you know", "basically", "literally",
                 "actually", "right", "so", "kind of", "sort of"];

// Results surfaced in LiveOverlay as a live counter
// Stored in session metadata for debrief analysis
```

### WPM Tracking

Words-per-minute is calculated from transcript word timings:

```typescript
// Ideal range: 130–160 WPM for interviews
// Displayed as a real-time gauge in the overlay
// Slow (<100): prompted to "pick up the pace"
// Fast (>180): prompted to "slow down"
```

### Diarisation

When `diarization` flag is enabled (Pro+), speaker turns are identified,
allowing Clarity to distinguish the user's speech from the interviewer's —
enabling smarter contextual hint generation.

---

## Screenshot Capture

When `screenshot_capture` is enabled, the overlay can optionally capture
the current screen (with explicit user permission) to provide visual
context to the AI — useful for coding interviews with shared screens.

```typescript
// Uses getDisplayMedia() — always prompts user for permission
// Frames are sent to the AI as base64 image attachments
// No frames are stored server-side — ephemeral per request
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: { frameRate: { ideal: 1, max: 2 } },  // low framerate — just for context
});
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+H` | Toggle overlay visibility |
| `Ctrl+Shift+M` | Toggle microphone on/off |
| `Ctrl+Shift+N` | Next question (mock sessions) |
| `Ctrl+Shift+F` | Request AI hint for current question |
| `Ctrl+Shift+S` | Save current answer to answer bank |
| `Escape` | Dismiss active overlay panel |

Shortcuts can be customised in *Settings → Shortcuts* or via
`/shortcuts` (public documentation page).

---

## Responsible Usage

Clarity's overlay and audio features are designed for **practice and
preparation**. Users are responsible for complying with:

- Their employer's or interviewer's policies on AI assistance
- Local laws regarding audio recording consent
- Platform terms of service (Zoom, Google Meet, etc.)

Clarity does **not** encourage deceptive use in formal interviews where
AI assistance is prohibited. The overlay feature is intended for:
- Mock and rehearsal sessions
- Practice rooms with peers
- Self-assessment and skill-building

---

## Privacy & Data Retention

| Data | Retention | Storage |
|---|---|---|
| Audio recordings | Session duration only (in-memory) | Never persisted |
| Transcripts | 90 days (user-configurable) | Supabase Storage, encrypted |
| Screen captures | Never stored | Ephemeral, edge function memory only |
| Session answers | Until deleted by user | Supabase Postgres, RLS-enforced |
