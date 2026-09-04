# CAREER_PILOT_AI_FEATURE_COMPLETION

## Personalization model (authoritative)

**Not vector RAG.** `embeddings_enabled: false`.

Active personalization mechanisms:

- Direct structured context injection  
- Explicit Resume/JD freeze (Practice Coach + Mock snapshots)  
- Answer Bank ID selection + snippets  
- SQL/metadata retrieval  
- Lexical similarity (gov validators)  
- Prompt-level contextualization + factual integrity gates  

## Hybrid registry

- Unknown ops → `UNKNOWN_OPERATION` (no charge) — `operationRouter.ts` / `aiOperationRegistry.ts`
- Live hint/answer post-gen gate — `assertLiveCoachOutputGrounded`
- Feature policy soft default remains for unnamed features only (distinct from route fail-closed)

## Feature statuses

| Feature | Status |
|---------|--------|
| Live hint/answer | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| Coach chat | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| STAR / polish | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| Prep unknown tools | Fail-closed `INVALID_TOOL` (no wrong default charge) |
| Mock TTS server | BLOCKED_BY_CONFIGURATION (`SERVER_TTS_ENABLED`) |
| Scorecard AI | IMPLEMENTED_NOT_RUNTIME_VERIFIED (no soft speech zeros) |
| Debrief AI | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| Gov AI gap-fill | Practice-labeled; inventory-dependent |
| Fine-tuning on user data | MISSING / forbidden without privacy program |

## Tests

- `aiOperationRegistryContracts`, `liveCoachFactualGateContracts`, prep unknown fail-closed suites
