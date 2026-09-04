# CAREER_PILOT_REMAINING_BLOCKERS

## P0 blockers (must clear before GO_PRODUCTION)

1. Apply pending migrations + regenerate `types.ts` (`assessment_context_snapshots`, `referral_programmes`, …)  
2. Deploy affected Edge Functions (`generate-scorecard`, `assemble-assessment`, `prep-tool`, `cancel-paper-generation-job`, `score-coding-submission`, `mock-tts`, …)  
3. Verify Python/Render worker health + HMAC  
4. Provider health + real feature paths: Gemini, Deepgram, Razorpay test webhook  
5. Genuine Live Copilot dual-channel session with persisted turns  
6. Genuine Mock Interview with voice + scored evidence  
7. Gov Exam Search→Analytics with inventory sufficiency  
8. Scorecard/Debrief/Analytics from persisted evaluated sessions  
9. Session History cross-type live probe  
10. User A/B RLS live probes  
11. Secure coding sandbox (still MISSING beyond JS practice)  
12. Monitoring/backup/rollback evidence  

## P1 blockers

- Calendar OAuth live lifecycle  
- Admin write-workflow certification  
- Full a11y/responsive certification  
- Learning content publishing  
- Soft PrepLab tools still Unavailable  

## External configuration

| Dependency | Status |
|------------|--------|
| Supabase project + service role for gen types | Required |
| Edge secrets (AI, Deepgram, Razorpay, Python) | Required |
| `SERVER_TTS_ENABLED` / Deepgram TTS | Optional for server Mock voice |
| India inventory / PYQ bank | Data-dependent |

## Deferred product scope

- Vector RAG / embeddings  
- Fine-tuning on private user data  
- Full Electron multi-route desktop  
- Live Razorpay production credentials  

## Release

**NO_GO** until P0 blockers cleared with RUNTIME_VERIFIED evidence.
