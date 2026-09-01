# Overlay UAT — Practice Coach

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
11. End session → debrief opens.  
12. Quit Electron → global shortcuts unregistered.

### Expected

- Explicit consent gates block Start until checked  
- Assistant remains visible on screen share by default  
- No stealth / concealment claims in UI  
- Credits reserved/deducted server-side with idempotency  

### Evidence commands

```bash
npm run test:run -- src/test/lib/overlay src/test/lib/ai/questionDetection.test.ts
npm run electron:build
```

Platform smoke: `docs/ELECTRON_SMOKE_CHECKLIST.md` (manual on Windows/macOS/Linux as available).

### 2026-08-02 session

- Unit overlay + detection tests: PASS
- Interactive desktop rehearsal UAT: **not run** (record CONDITIONAL until completed)
- Deploy: migrations + generate-hint / deduct-credits / billing EFs redeployed; Stripe secrets still absent
