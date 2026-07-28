# Implementation Plan — Sprint Roadmap (post Agent 5/5)

Supersedes the older Phase 1/2 list below for **launch gating**. Full detail: [`docs/FIX_ROADMAP_SPRINTS_2026-07-26.md`](../docs/FIX_ROADMAP_SPRINTS_2026-07-26.md).

## Verdict
- 🔴 NO-GO public GA
- 🟡 CONDITIONAL GO invite-only beta after **deploy + migration apply** of Sprint 0 code below

## Sprint 0 (beta gate) — code complete locally (2026-07-27)

### Done in repo (awaiting Edge Function deploy + remote migrations)
1. **Money-path** — All charging EFs use `deductCreditsAtomic` + `refundCredits` + idempotency keys (9 remaining migrated).
2. **Razorpay** — Catalog-only credits; grant-before-paid; idempotency claim/release; Vitest product rules pass.
3. **Ingest** — `bulk-import-questions`: zod (max 500), 2MB bound, distributed `BULK_INGEST` RL, fail-closed without `INGEST_API_KEY`.
4. **Ban** — Shared `requireAuth` fail-closed on ban lookup errors; `authStore` signs out banned users; Login clarifies client vs server lockout.
5. **Frontend** — LazyMotion on GovExams + MockTestHub; duplicate rooms route removed; dead SettingsSubscription/Credits barrel exports dropped; calendar 501 honesty.
6. **CSP** — Script `unsafe-inline` removed (theme + JSON-LD external); style `unsafe-inline` retained for Tailwind.
7. **Rate limits** — No sync in-memory RL in EF `index.ts`; security gates pass.
8. **utils.deductCredits** — Delegates to `deductCreditsAtomic`.

### Still external / DB (not code-complete as production behavior)
1. **P0-21** `cleanup_expired_documents` → `SET search_path = public`
2. **P0-22** migrate `avatars` into `storage.buckets`
3. **P0-23** share tokens ≥128 bits + live `pg_policies` verify + rate limit
4. Apply pending migrations (`deduct_credits` revoke, BYOK null)
5. Redeploy all affected Edge Functions
6. Live Stripe/Razorpay preflight with production secrets
7. Auth dashboard rate limits / MFA (Sprint 3)

### Known residual risk
- `deductCreditsAtomic` still wraps select-then-update (not a single Postgres RPC). Concurrent races mitigated by `.gte` guard + idempotency, but a true RPC remains a post-beta hardening item.

## Later
- Sprint 1: billing_settings / exam anon / metrics insert / question-images drift / drop overloads
- Sprint 2: room indexes + live advisors + fresh migrate drill
- Sprint 3: Auth dashboard (MFA, leaked-password, OTP)

## Guardrails
- Do NOT re-add stealth code.
- Do NOT touch `profiles.is_admin` — admin lives in `user_roles`.
- Keep AI model default `gemini-2.0-flash`.
- No `.single()` — use `.maybeSingle()`.
- All new SQL functions must `SET search_path = public` and include GRANTs.
