# Overlay Session State Machine

Canonical states live in `src/lib/overlay/overlaySessionStates.ts`.

**Wired (2026-08-02):** `overlayStore.session_pipeline_state` is driven by `useAudioSession` / `useLiveCopilot` / hint lifecycle; `OverlayListeningIndicator` shows `overlayStateLabel` + recovery text.

## States

| State | User-facing label | Recovery |
|-------|-------------------|----------|
| `idle` | Ready | Start a session |
| `connecting` | Connecting | Wait or cancel |
| `listening` | Listening | Pause / end |
| `speech_detected` | Speech detected | — |
| `transcribing` | Transcribing | — |
| `question_detected` | Question detected | Edit / pin |
| `generating_guidance` | Generating guidance | Cancel / wait |
| `guidance_ready` | Guidance ready | Shorten / hint / next |
| `follow_up_detected` | Follow-up detected | — |
| `paused` | Paused | Resume |
| `reconnecting` | Reconnecting | Bounded retry |
| `rate_limited` | Rate limited | Wait |
| `insufficient_credits` | Insufficient credits | Billing |
| `permission_denied` | Permission denied | Grant mic |
| `audio_unavailable` | Audio unavailable | Change device |
| `backend_unavailable` | Backend unavailable | Retry |
| `ai_provider_unavailable` | AI unavailable | Retry later |
| `session_ending` | Ending session | — |
| `session_saved` | Session saved | Open debrief |

## Rules

- Illegal transitions are rejected (`transitionOverlayState` keeps prior state).
- Every error/rate-limit state has recovery copy (no indefinite spinner).
- Reconnect must not create a second credit reservation for the same operation key.
- Partial transcripts stay visually distinct from finalized questions.

## Related hint UI states

`overlayStore.hint_state`: `idle` | `listening` | `generating` | `streaming` | `ready` | `error` | `offline_fallback` — maps into the guidance portion of the machine above.
