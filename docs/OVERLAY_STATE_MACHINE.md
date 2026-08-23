# Overlay Session State Machine

Canonical states live in `src/lib/overlay/overlaySessionStates.ts`.
Authoritative product ownership (live vs mock) lives in `src/store/overlaySessionAuthorityStore.ts`
and is begun/torn down via `src/lib/session/overlayProductSession.ts`.

**Wired:** `overlayStore.session_pipeline_state` is driven by `useAudioSession` / `useLiveCopilot` /
mock question TTS / hint lifecycle; `OverlayListeningIndicator` shows `overlayStateLabel` + recovery text.
Late updates are rejected when the authority lifecycle is `terminal`.

## Product modes

| Mode | Orchestration | Question path |
|------|---------------|---------------|
| `live` | `useLiveCopilot` + `LiveSessionController` | Tab/mic STT → `question_detected` |
| `mock` | `useSessionOrchestrator` + `MockSessionController` | Generate + TTS → `question_generated` / `question_spoken` |

Do not infer mode from route, visible component, audio, or TTS.

## States

| State | User-facing label | Notes |
|-------|-------------------|--------|
| `idle` | Ready | Start a session |
| `connecting` | Connecting | Wait or cancel |
| `listening` | Listening | Pause / end |
| `speech_detected` | Speech detected | — |
| `transcribing` | Transcribing | — |
| `tab_audio_detected` | Tab audio detected | Live |
| `question_detected` | Question detected | Live |
| `question_generated` | Question ready | Mock |
| `question_spoken` | Question spoken | Mock |
| `candidate_answering` | Your turn | Mock |
| `answer_finalizing` | Finalizing answer | Mock |
| `next_question_pending` | Next question | Mock |
| `generating_guidance` | Generating guidance | Cancel / wait |
| `guidance_ready` | Guidance ready | Shorten / hint / next |
| `follow_up_detected` | Follow-up detected | Live |
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

- Illegal transitions are rejected (`transitionOverlayState` keeps prior state); mode-aware filters apply.
- Every error/rate-limit state has recovery copy (no indefinite spinner).
- Reconnect must not create a second credit reservation for the same operation key.
- Partial transcripts stay visually distinct from finalized questions.
- Overlay mounts only when authority is `ready`/`active` with auth + mode + session id.
- End session: abort → stop media → persist → terminal → teardown stores.

## Related hint UI states

`overlayStore.hint_state`: `idle` | `listening` | `generating` | `streaming` | `ready` | `error` | `offline_fallback` — maps into the guidance portion of the machine above.
