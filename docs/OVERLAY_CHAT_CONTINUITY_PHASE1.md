# Overlay Chat Continuity — Phase 1

**Date:** 2026-09-03  
**Release decision after this phase:** `NO_GO` for full production certification (billing/security P0s remain).

## Goal

One continuous Live Copilot overlay Chat flow: when listening/question detection fails, highlight Chat; when Chat opens, show this session’s AI Help Q&A + coach turns.

## Implemented

| Item | Evidence |
|------|----------|
| Unified timeline | `src/lib/overlay/sessionConversation.ts` merges `chat_history` + `hint_history` |
| Chat panel | `OverlayChatPanel.tsx` renders timeline + system tip |
| Prefill composer | `OverlayChatInput` `initialValue` / `chat_prefill` |
| Chat attention store | `overlayStore.chat_attention`, `chat_attention_reason`, `chat_prefill` |
| Visible Chat control | Pulsing primary Chat next to AI Help when attention is on (`OverlayToolbar`) |
| Tab bar CTA | Amber Chat tab + More-menu badge (`OverlayTabBar`) |
| Listening timeout | `ListeningTimeoutHelp` sets attention after 12s |
| AI Help miss | `LiveOverlay.handleGenerate` → `manual_needed` attention |
| Low confidence STT | `diarization.processUtteranceForDiarization` + `isLowConfidenceInterviewerSpeech` |
| Typed recovery | Chat submit with attention reason → `requestLiveHint` |
| Answer banner | Amber “Open Chat” banner in `OverlayHintPanel` |
| Tests | `sessionConversation.test.ts`, extended `coachChatContinuity.test.ts` |

## Verification checklist

1. AI Help Q/A then open Chat → prior Q/A visible in timeline.
2. Coach chat → leave tab → return → messages remain.
3. Force audio unavailable / 12s no speech → Chat pulses.
4. Low-confidence interviewer utterance → Chat highlighted + prefill.
5. Typed recovery generates hint once; composer clears only on accept.

## Not in this phase

Billing/security P0s, Mock TTS catalogue, provider health matrix, desktop capture-exclusion guarantees.
