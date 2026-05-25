# Mock Interview + Live Copilot Audit — 2026-05-25

Production fixes applied across mock interview flow, live AI copilot, scoring, and shared data layer.

---

## Issue → File → Fix

| Issue | File(s) | Fix |
|-------|---------|-----|
| **Double credit billing** | `useLiveCopilot.ts` | Removed client `deductCredits` after hints/answers; server edge functions deduct once; `refreshCredits()` syncs profile |
| **Duplicate transcript lines** | `useAudioSession.ts`, `diarization.ts` | Removed second `addUtterance` (pipeline already persists) |
| **Build failure** | `LiveOverlay.tsx` | Removed stray trailing backticks |
| **Session detail empty Q&A** | `SessionDetail.tsx` | Query `session_answers` (not missing `session_questions` table); map columns for UI |
| **Scorecard never generated** | `useScorecard.ts`, `MockSession.tsx` | Load `session_answers`; mock ends at `/app/scorecard/:id`; write scores back to `sessions` |
| **Orchestrator random session id** | `useSessionOrchestrator.ts`, `MockSession.tsx` | Accept `session_id` from DB `getOrCreateSession` |
| **Weak question detection** | `interviewerQuestion.ts`, `diarization.ts`, `deepgramStream.ts` | Heuristic beyond trailing `?` |
| **Missing session_id on hints** | `geminiClient.ts`, `useSessionOrchestrator.ts` | Pass `session_id` / `question_id` to edge |
| **No coach context on live** | `useLiveCopilot.ts` | `coachStore.initContext()` on session start |
| **No audio reconnect UI** | `LiveRehearsal.tsx`, `LiveOverlay.tsx`, `useLiveCopilot.ts` | Expose `reconnectAudio`; Reconnect button on error banner |
| **Mock persist incomplete** | `MockSession.tsx` | `duration_seconds`, `session_type`, transcript insert aligned with live path |
| **Warmup invalid model** | `MockWarmup.tsx` | Default `gemini-2.0-flash` |

---

## Phase status

### Mock interview

| Area | Status |
|------|--------|
| Setup / scheduling | **PASS** (`MockInterview`, `/app/interviews`) |
| Question engine | **PASS** (`generate-questions` + `MockSession`) |
| Session flow | **FIXED** (DB id sync, scorecard redirect) |
| Real-time STT | **PASS** (browser STT on mock; Deepgram on live) |
| AI evaluation | **FIXED** (`useScorecard` uses real answers) |
| Post-session debrief | **NEEDS MANUAL TEST** (links added; `generate-debrief` optional) |
| Analytics | **NEEDS MANUAL TEST** (`/app/analytics`, mock-test analytics separate) |

### Live copilot

| Area | Status |
|------|--------|
| Session init | **FIXED** (coach context, resume/JD via documents) |
| Transcription | **FIXED** (dedupe utterances, reconnect) |
| Question detection | **FIXED** (broader heuristics) |
| AI generation | **FIXED** (single credit path, session_id) |
| Overlay UX | **PASS** (prior compliance pass) |
| Error handling | **FIXED** (reconnect banner) |
| Performance | **PASS** (no duplicate utterance writes) |
| Security | **PASS** (keys server-side; RLS on tables) |

---

## Manual validation checklist

1. `npm install && npm run build`
2. Mock: `/app/mock` → session → finish → scorecard generates
3. Live: `/app/live` → mic → transcript → auto-hint on “Tell me about…”
4. Credits: one deduction per hint (check profile balance)
5. Session detail: questions/answers visible; Scorecard + Debrief buttons work

---

## Remaining (non-blocking)

- `schedule-interview` edge function not deployed (scheduler uses direct DB insert)
- Document PiP / window auto-hide on overlay
- Full PDF export (JSON download only on scorecard today)
- MCQ mock-test system is separate (`/app/mock-test/*`) — already functional with own EFs
