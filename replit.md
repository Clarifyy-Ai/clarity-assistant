# ConfideQ

A React + Vite SPA (Single Page Application) for confidential Q&A and interview preparation.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite 5
- **UI**: Tailwind CSS, Radix UI, shadcn/ui components, Framer Motion
- **State**: Zustand, TanStack React Query
- **Backend**: Supabase (auth, database, edge functions)
- **Audio**: Deepgram SDK (speech-to-text)
- **Analytics**: PostHog
- **Error Monitoring**: Sentry
- **Payments**: Stripe

## Project Structure

```
src/
  App.tsx           # Root component with routing
  main.tsx          # Entry point (Sentry, PostHog, SW init)
  components/       # Shared UI components
  hooks/            # Custom React hooks
  integrations/     # Supabase client setup
  lib/              # Utility functions
  pages/            # Route-level page components
  store/            # Zustand state stores
  types/            # TypeScript types (incl. Supabase generated)
supabase/           # Supabase config and migrations
```

## Development

The app runs on port 5000 via Vite dev server.

```bash
npm run dev        # Start dev server (port 5000)
npm run build      # Production build
npm run typecheck  # TypeScript checks
npm run lint       # ESLint
npm test           # Vitest unit tests
```

## Environment Variables

Key variables (set as Replit shared env vars):
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon key (public)
- `VITE_SUPABASE_PROJECT_ID` — Supabase project ID

Optional variables (add in Replit Secrets if needed):
- `VITE_STRIPE_PUBLISHABLE_KEY` — Stripe public key (for billing)
- `VITE_POSTHOG_KEY` — PostHog analytics key
- `VITE_SENTRY_DSN` — Sentry error monitoring
- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` — Sentry source maps (production only)

AI provider keys (stored as Supabase edge function secrets, NOT in Replit):
- `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` — handled by Supabase edge functions

## Auth Architecture (Critical)

The app uses **two coexisting auth-related stores** which were previously broken:

- `src/store/authStore.ts` — **Single source of truth**. Initialized by `App.tsx` via `authStore.initialize()`. Handles session loading, profile fetching, and auth state transitions.
- `src/store/userStore.ts` — **Compatibility wrapper** that proxies `useAuthStore` from `authStore.ts`. Adds computed `isLoading`/`isAuthenticated` and shims (`clearAuth`, `setProfile`, `setUser`). The 50+ components that import from this file now read live data.

### Key rules:
- Never add a second `supabase.auth.onAuthStateChange` listener. `authStore.initialize()` owns the single listener.
- Never recreate `.env.local` with placeholder values (it would shadow the real `.env`).
- `src/hooks/useAuth.ts` provides auth action helpers (sign in, sign up, etc.) for form components. It does NOT own an auth listener.

## Supabase Setup

- **Client singleton**: `src/integrations/supabase/client.ts` — only file that calls `createClient()`
- **Wrapper library**: `src/lib/supabase/` — re-exports the singleton + domain helpers (auth, database, storage, realtime)
- **Migration**: `supabase/migrations/` — one migration file defining all tables (profiles, sessions, interviews, etc.)
- **Edge functions**: `supabase/functions/` — deployed separately to Supabase (ai-coach-chat, generate-debrief, etc.)
- **Column name**: profiles table uses `plan` (not `plan_id`) — authStore.loadProfile fixed accordingly

## Deployment

Configured as a **static** deployment:
- Build: `npm run build`
- Public dir: `dist`
