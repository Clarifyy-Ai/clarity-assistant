# Architecture

## Overview

Clarity is a single-page React application backed by Supabase (BaaS) and a
fleet of Deno edge functions. The frontend is intentionally thin — all AI
calls, credit deductions, and sensitive operations run server-side in edge
functions so API keys never reach the browser.

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (SPA)                        │
│  React + Zustand + Tailwind                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │  Pages   │  │  Hooks   │  │  Stores  │             │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘             │
│       └─────────────┴─────────────┘                    │
│                      │                                  │
│            Supabase JS Client                           │
└──────────────────────┬──────────────────────────────────┘
                       │  HTTPS / WebSocket
          ┌────────────┴────────────┐
          │       Supabase          │
          │  ┌──────────────────┐   │
          │  │   PostgreSQL     │   │
          │  │   (RLS enforced) │   │
          │  ├──────────────────┤   │
          │  │   Auth (JWT)     │   │
          │  ├──────────────────┤   │
          │  │   Storage        │   │
          │  │  (resumes, docs) │   │
          │  ├──────────────────┤   │
          │  │   Realtime       │   │
          │  │ (practice rooms) │   │
          │  └──────────────────┘   │
          │                         │
          │  ┌──────────────────┐   │
          │  │  Edge Functions  │   │  ← Deno runtime
          │  │  (Deno)          │   │
          │  └──────┬───────────┘   │
          └─────────┼───────────────┘
                    │
        ┌───────────┼────────────┐
        │           │            │
   OpenAI      Anthropic      Gemini
   (GPT-4o)    (Claude 3.5)   (Flash 2.0)
```

## Frontend Architecture

### Store Design (Zustand)

```
authStore       — user session, profile, plan, credits, BYOK keys
sessionStore    — active interview session state, questions, answers
audioStore      — mic device, recording state, RMS level, transcripts
globalStore     — feature flags, app config, notifications, theme
uiStore         — modals, drawers, toasts, sidebar state
```

Stores are sliced — each concern lives in its own file under `src/store/`
and re-exported from `src/store/index.ts`.

### Routing

React Router v6 with nested layouts:

```
/                     → Landing (public)
/pricing              → Pricing (public)
/blog, /help          → Marketing pages (public)
/login, /signup       → Auth pages (guest-only guard)
/onboarding           → OnboardingIndex (auth + !onboarded guard)
/app/*                → App shell (auth + onboarded guard)
  /app/dashboard
  /app/live/overlay
  /app/live/mock-session
  /app/mock/*
  /app/prep/*
  /app/answer-bank/*
  /app/debrief/*
  /app/company-research/*
  /app/sessions/*
  /app/practice/*
  /app/documents/*
  /app/interviews/*
  /app/analytics
  /app/settings/*
/admin/*              → Admin shell (auth + isAdmin guard)
```

### Data Flow — AI Request

```
Component
  → calls hook (e.g. useSTARBuilder)
    → hook calls Supabase edge function via fetch()
      → edge function: requireAuth() → deductCredits() → callAI()
        → OpenAI / Anthropic / Gemini
      → edge function returns EdgeSuccess<T>
    → hook updates Zustand store
  → component re-renders with result
```

### Feature Flag Resolution

```
globalStore.featureFlags (loaded from DB on login)
  + user.planId
  → FEATURE_PLAN_GATES[flagId] → minPlan check
  → useFeatureFlag(flagId) → boolean
  → <FeatureGate flag="company_research"> wraps UI
```

## Edge Function Architecture

All functions share `_shared/`:

```
_shared/
  cors.ts    — CORS headers for all origins in dev, locked in prod
  types.ts   — Shared TS interfaces (AuthContext, STARAnswer, etc.)
  utils.ts   — requireAuth, deductCredits, callAI, response helpers
  supabase.ts — Admin client factory
  gemini.ts  — Gemini-specific streaming helpers
```

### Credit Deduction Flow

```
deductCredits(userId, feature)
  1. SELECT credits FROM profiles WHERE id = userId
  2. IF credits = -1 OR plan = 'enterprise' → return success (unlimited)
  3. IF credits < cost → return { success: false }
  4. UPDATE profiles SET credits = credits - cost
  5. INSERT INTO credit_transactions (log entry)
  6. return { success: true, balanceAfter }
```

## Security Model

| Concern | Mechanism |
|---|---|
| Auth | Supabase JWT — verified in every edge function via `requireAuth()` |
| Data isolation | Row-Level Security on every table — `user_id = auth.uid()` |
| API keys | Stored as Supabase secrets — never in frontend bundle |
| BYOK keys | Encrypted client-side before storage; decrypted only in edge functions |
| Admin routes | `is_admin = true` check in both RLS and edge functions |
| Rate limiting | In-memory per cold-start + DB-level abuse detection |

## Performance Considerations

- All AI responses are streamed where supported (SSE via `streamResponse()`)
- Supabase Realtime used only for practice rooms (not polling)
- React Query / SWR patterns via Zustand selectors + `loadProfile()` cache
- Code-split by route — each page group is a lazy chunk
- Images served via Supabase Storage CDN with signed URLs
