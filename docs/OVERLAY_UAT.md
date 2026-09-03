# Overlay UAT — Practice Coach / Live Overlay

## UAT: Desktop overlay rehearsal

1. Install / launch Career Pilot (Electron) or open `/app/live/rehearsal` in browser.  
2. Sign in.  
3. Run device / microphone check (must not consume paid credits).  
4. On Connect step, acknowledge **screen share visibility** and **responsible use**.  
5. Start practice session.  
6. Confirm capture indicator is visible.  
7. Speak a behavioral question; verify transcript + question detection.  
8. Receive STAR / structured prompts; request shorter version.  
9. Toggle always-on-top only if desired (default off).  
10. Simulate network loss → reconnect; session ID preserved; no double charge.  
11. End session → debrief opens (async job: queued → completed; Cancel available while in-flight).  
12. Quit Electron → global shortcuts unregistered.

### Chat continuity checks (Phase 1+)

1. AI Help Q/A → open Chat → prior Q/A visible in unified timeline.  
2. Coach chat → leave Chat → return → messages remain.  
3. Mute / force audio unavailable or wait 12s → Chat control pulses + banner.  
4. Low-confidence interviewer utterance → Chat highlighted + prefill.  
5. Typed recovery generates hint once; composer clears only on accept.  
6. AI Help with unclear STT uses recovery/`chat_prefill` before Chat nudge.

### Expected

- Explicit consent gates block Start until checked  
- Assistant remains visible on screen share by default  
- No stealth / concealment claims in UI; presentation-safe does **not** call `setContentProtection`  
- Credits reserved/deducted server-side with idempotency  
- Debrief generation is durable (202 job + poll; gateway timeout safe)

### Evidence commands

```bash
npm run test:run -- src/test/lib/overlay src/test/lib/ai/coachChatContinuity.test.ts src/test/lib/overlay/sessionConversation.test.ts src/test/lib/session/liveQuestionFromTranscript.test.ts src/test/lib/ai/questionDetection.test.ts
npm run test:run -- src/test/lib/edge/generateDebriefAsync.test.ts src/test/lib/edge/generateDebriefContracts.test.ts
npm run electron:build
```

Platform smoke: `docs/ELECTRON_SMOKE_CHECKLIST.md` (manual on Windows/macOS/Linux as available).

### 2026-09-03 session

| Gate | Result |
|------|--------|
| Unit overlay + chat continuity + question resolve contracts | **PASS** (coachChatContinuity 7, sessionConversation, liveQuestionFromTranscript, overlay lib suite) |
| Presentation-safe honesty contract | **PASS** (no Electron content-protection call from prefs) |
| Durable debrief job contracts | **PASS** (`generateDebriefAsync` + contracts) |
| Mocked interactive UAT e2e (`overlay-interactive-uat.spec.ts`) | Added — run with Playwright against local app |
| Interactive desktop rehearsal UAT (mic/STT/live share) | **CONDITIONAL** — requires signed-in human + mic/tab audio |
| Full production GO | **NO_GO** until interactive mic UAT + Razorpay smoke + migration/EF deploy |

### Interactive UAT record sheet

| Step | Pass? | Notes |
|------|-------|-------|
| Consent gates | ☐ | |
| Mic precheck no charge | ☐ | |
| Question detect / AI Help | ☐ | |
| Chat timeline continuity | ☐ | |
| Chat attention on listen fail | ☐ | |
| Typed recovery | ☐ | |
| End → debrief job completes | ☐ | |
| Cancel in-flight debrief | ☐ | |
| Network reconnect | ☐ | |
| Electron quit clears hotkeys | ☐ | |
