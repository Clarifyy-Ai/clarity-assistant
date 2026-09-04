# AI Platform Foundation — gap-close status

Lean audit note for the Career Pilot AI platform foundation pass.
This is **not** a full GO_PRODUCTION certification for every module.

| Area | Status | Notes |
|------|--------|-------|
| Hybrid matrix + credits + idempotency | Done | `operationRouter.ts`, `hybridExecute.ts` |
| AI Operation Registry | Done | `aiOperationRegistry.ts`; unknown ops → `UNKNOWN_OPERATION` (HTTP 400), no credit charge |
| Credit key alignment | Done | MATRIX keys match `creditEconomics` catalog (`ai_coach_message`, `create_mock_test`, `star_builder`, `resume_analysis`, …) |
| `ai_coach_chat` feature policy | Done | Registered in `aiFeaturePolicy.ts` |
| Immutable Practice Coach context | Done | `practiceCoachContext.ts` + store; `useLiveCopilot` freezes at start; hint/answer/chat prefer snapshot |
| Factual gate on live hint/answer | Done | `assessLiveCoachFactualIntegrity` / `assertLiveCoachOutputGrounded` in `generate-hint` + `generate-answer` |
| Brand hygiene (live `src/`) | Done | Exports / storage keys / vite download labels → Career Pilot with Clarify read-compat |
| Scorecard no-fake zeros | Intact | Prior pass unchanged |
| Vector RAG / embeddings | Deferred | `embeddings_enabled: false` — not shipped |
| Fine-tuning on user data | Deferred | Forbidden without separate privacy program |
| Full module GO_PRODUCTION | Deferred | Out of scope for this pass |
| AI credit FE↔Edge parity gate | Done | `npm run billing:parity-ai` (`scripts/ai-credit-catalog-parity.mjs`) |

## Personalization (not vector RAG)

Career Pilot personalization is **structured context injection** plus Answer Bank content, frozen session/practice snapshots, and lexical similarity for retrieval/ranking. It is **not** vector RAG: there is no embedding index, no similarity search over vectors, and `embeddings_enabled` remains `false`. Do not describe this stack as RAG.

## Acceptance checks

1. Unknown hybrid operations return `UNKNOWN_OPERATION` without charging.
2. Live Copilot hints/answers use a frozen, hashed user context snapshot.
3. Post-generation groundedness validation runs (not prompt-only).
4. Credit cost keys match the economics catalog (`billing:parity-ai`).
5. User-facing brand strings / export names in live app paths say Career Pilot.

## Explicitly deferred

- Full inventory certification + 13 separate CAREER_PILOT_*.md reports
- Vector RAG infrastructure (`embeddings_enabled: false`)
- Desktop/sandbox re-architecture
- Razorpay/provider live verification (config-dependent)
