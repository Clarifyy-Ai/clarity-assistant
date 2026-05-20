# Production Hardening — 10 Sequential Passes

Per your user-memory rule (component-by-component, guardrails, don't break working features), I'll execute these as **10 separate approval gates**, not a single mega-change. Each pass is scoped, verifiable, and reversible.

## Guardrails (apply to all passes)
- Do NOT modify auth flows, RLS, or edge functions outside the pass's scope.
- Do NOT touch `src/integrations/supabase/types.ts` (auto-generated).
- Every DB change goes through `supabase--migration` (your approval required).
- Every edge function change is deployed + smoke-tested before moving on.
- No `@ts-nocheck` additions; existing ones removed only when underlying types are fixed.

## Pass order & scope

| # | Pass | Scope | Risk |
|---|------|-------|------|
| 1 | **RLS: `profiles_own_update`** | 1 migration + audit ~5 frontend files that update profiles | Medium — wrong column whitelist breaks settings |
| 2 | **Admin auth race + Admin.tsx** | `authStore`, `ProtectedRoute`, `Login.tsx`, `AdminLayout.tsx`, `Admin.tsx` | Medium — could lock users out |
| 3 | **Stripe webhook dedupe** | Pick canonical, delete other, update Stripe dashboard URL note | Low — but irreversible delete |
| 4 | **Edge function audit (38 fns)** | Apply standard auth+CORS+validation pattern; add rate-limit to AI fns | High — biggest blast radius |
| 5 | **Mock test creation flow** | `create-test`, `select-test-questions`, `generate-practice-questions`, `TestConfigure.tsx` | Medium |
| 6 | **Deepgram token + retry** | `deepgram-token` EF, `deepgramStream.ts`, `useAudioSession.ts` toast surface | Medium |
| 7 | **Overlay minimize/restore/chat** | `overlayStore`, `OverlayWindow`, toolbar, chat panel, settings | Low — UI only |
| 8 | **Settings forms + remove @ts-nocheck + mock data** | ~13 hook files, `AdminModelCosts`, `CodingHints`, settings pages | Medium — type fixes can cascade |
| 9 | **Router v7 flags, lazy routes, ErrorBoundary, testids, smoke tests** | `App.tsx`, `main.tsx`, add `e2e/smoke.spec.ts` | Low |
| 10 | **Sentry + structured logs + `model_usage_logs` table + robots.txt** | New migration, `_shared/utils.ts`, `main.tsx`, `robots.txt` | Low |

## Per-pass workflow

For each pass I will:
1. Read all affected files (parallel).
2. Make the minimum changes specified.
3. Deploy any touched edge functions; smoke-test via `curl_edge_functions`.
4. Report what changed, what was verified, and what's still risky.
5. **Stop and wait for your "next pass" confirmation** before starting the next one.

## Open decisions before I start

1. **Pass 4 scope** — auditing 38 edge functions in one pass is huge. I recommend splitting it into 4a (auth-critical: deduct-credits, deepgram-token, create-checkout, delete-account, export-user-data, AI generators) and 4b (the rest). OK to split?
2. **Pass 10 Sentry** — requires you to add `VITE_SENTRY_DSN` secret/env. Provide DSN, or skip Sentry and keep only structured logs + robots.txt?
3. **Pass 3 Stripe** — I'll pick `stripe-webhook` (shorter path, Stripe convention) as canonical and delete `process-stripe-webhook`. If `process-stripe-webhook` is the one currently wired in your Stripe Dashboard, deleting it breaks live payments. **Confirm which URL is wired in Stripe Dashboard today** before I proceed with Pass 3.
4. **Start point** — begin with Pass 1 (RLS) now, or reorder?

Reply with answers + "start Pass 1" and I'll begin.