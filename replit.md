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

Key variables (set in `.env`):
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon key
- `VITE_SUPABASE_PROJECT_ID` — Supabase project ID

See `.env.local` for the full list of optional variables (Stripe, Sentry, PostHog, Deepgram, etc.).

## Deployment

Configured as a **static** deployment:
- Build: `npm run build`
- Public dir: `dist`
