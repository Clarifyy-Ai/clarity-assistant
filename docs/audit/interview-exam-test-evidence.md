# Test evidence

## Added in this pass

- `src/test/lib/session/interviewSessionFsm.test.ts`
- `src/test/lib/gov-exam/examCertification.test.ts`
- `src/test/lib/interview/certificationWave.test.ts`

Covers: interview FSM, exam FSM, honest rank, answer-key strip, recovery queue, syllabus labels, explainable analysis, practice plan, JS runner sandbox, transcript finality, tenant A/B contract, overlay ethics gate, entitlement separation.

## Existing (still relied on)

- Overlay consent, resume parse, exam timer, blueprint, billing gates, mastery engine.

## Not run / blocked

- Playwright `e2e/ai-audio.spec.ts` skipped (media mocks).
- Live Deepgram/Gemini: BLOCKED_CREDENTIALS.
- Cross-tenant RLS against a live Supabase project: unit contract only unless `rls:spot-check` has credentials.
