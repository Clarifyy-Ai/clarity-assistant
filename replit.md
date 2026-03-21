# Clarity AI — Interview Preparation Platform

A React 18 + Vite SPA for AI-powered interview preparation. Real-time AI coaching during live interviews, mock session simulations, deep analytics, and gamification.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite 5
- **UI**: Tailwind CSS, Radix UI, shadcn/ui, Framer Motion
- **State**: Zustand, TanStack React Query
- **Backend**: Supabase (auth, PostgreSQL, storage, edge functions)
- **AI**: OpenAI GPT-4o, Anthropic Claude, Google Gemini (routed via Edge Functions)
- **Audio**: Deepgram (speech-to-text, currently stubbed — needs API key)
- **Analytics**: PostHog (optional)
- **Payments**: Stripe (optional)

## Port

Runs on **port 5000** via Vite dev server.

## Project Structure

```
src/
  App.tsx                     # Root + router (50+ routes)
  main.tsx                    # Entry point (Sentry, PostHog init)
  components/
    auth/                     # LoginForm, SignupForm, OAuthButton, VerifyEmailModal
    billing/                  # BillingHistory, CreditBalance, PricingCard, UpgradeModal
    layout/                   # AppLayout, AppSidebar, AppTopBar, ProtectedRoute, etc.
    live/                     # LiveSessionController, LiveTranscriptStream, etc.
    overlay/                  # OverlayWindow, StealthMouseGuard, etc.
    ui/                       # shadcn/ui components
  hooks/
    useSessionOrchestrator.ts # Mock/live session state machine (FIXED)
    useGamification.ts        # XP, badges, streaks (persisted in localStorage)
    useCredits.ts             # Credit balance + deductions
    useDeepgramStream.ts      # STT stub (connect real key when available)
    ...
  lib/
    ai/
      localQuestionBank.ts    # 90+ fallback questions (7 interview types) — no API needed
      modelRouter.ts          # Routes to Gemini/OpenAI/Claude via Edge Functions
      offlineTemplates.ts     # Instant hint templates when offline
      geminiClient.ts         # Calls generate-hints Edge Function
      openaiClient.ts         # Calls ai-coach-chat Edge Function
      anthropicClient.ts      # Calls ai-coach-chat Edge Function
    billing/
      creditsManager.ts       # checkCredits / deductCredits (via Supabase RPC)
      subscriptionManager.ts  # Stripe subscription management
    supabase/
      client.ts               # Re-exports singleton + uploadFile/deleteFile helpers
  integrations/
    supabase/client.ts        # createClient() SINGLETON — never duplicate
  pages/
    auth/                     # Login, Signup, VerifyEmail, ResetPassword, AuthCallback
    marketing/                # Landing, Pricing, Blog, Help, Shortcuts
    onboarding/               # 5-step onboarding wizard
    app/                      # All protected app pages (50+)
    Scorecard.tsx             # Post-session scorecard
    NotFound.tsx              # 404 page
  store/
    authStore.ts              # SINGLE SOURCE OF TRUTH for auth
    userStore.ts              # Re-export of authStore (backward compatibility)
    sessionStore.ts           # Active session state
    gamificationStore         # Inline in useGamification.ts (persisted)
    overlayStore.ts           # Overlay/stealth mode state
    ...
  types/                      # TypeScript types
supabase/
  migrations/
    20260318032847_*.sql      # Original schema (profiles, sessions, credit_transactions, coaching_context)
    20260321000000_add_missing_tables.sql  # 28 additional tables (MUST APPLY to Supabase)
  functions/
    generate-questions/       # NEW — creates mock session questions via Gemini
    ai-coach-chat/            # AI answers (OpenAI/Claude)
    ai-feedback/              # Score answers post-session
    company-research/         # Company profiles
    generate-debrief/         # Post-session debrief
    generate-hints/           # Live hints
    generate-star-answer/     # STAR method builder
    polish-star-section/      # STAR section polishing
    prep-tool/                # Prep lab features
    schedule-interview/       # Calendar integration
    send-email/               # Email notifications
    delete-account/           # GDPR delete
    export-user-data/         # GDPR export
```

## Environment Variables

Set in `.env`:
```
VITE_SUPABASE_URL=https://...supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...    # Supabase anon key
VITE_SUPABASE_ANON_KEY=eyJ...          # Same value as PUBLISHABLE_KEY (alias for edge function calls)
VITE_SUPABASE_PROJECT_ID=...
```

Optional (needed for full feature set):
```
VITE_POSTHOG_KEY=phc_...               # Analytics (optional)
VITE_STRIPE_PUBLISHABLE_KEY=pk_...     # Billing (optional)
VITE_SENTRY_DSN=https://...            # Error tracking (optional)
```

Edge Function secrets (set in Supabase Dashboard → Project Settings → Edge Functions):
```
GEMINI_API_KEY=...        # Google Gemini (AI answers, question generation)
OPENAI_API_KEY=...        # OpenAI GPT-4o (AI answers)
ANTHROPIC_API_KEY=...     # Anthropic Claude (AI answers)
DEEPGRAM_API_KEY=...      # Speech-to-text for live sessions
```

## Auth Architecture

- `authStore.ts` — single source of truth. Called once via `App.tsx → authStore.initialize()`.
- `userStore.ts` — compatibility re-export, proxies authStore.
- `ProtectedRoute.tsx` — handles auth checks, onboarding redirect, admin gates.
- `AuthCallback.tsx` — handles OAuth redirect from Google/GitHub (route: `/auth/callback`).
- Auth flow: `detectSessionInUrl: true` + PKCE flow.

### Rules
- Never add a second `supabase.auth.onAuthStateChange` listener.
- Never recreate `.env.local` with placeholder values.
- All AI API keys live in Edge Function secrets — NEVER expose in frontend env vars.

## Session / Mock Interview Flow

1. User configures session at `/app/mock`
2. `MockInterview.tsx` calls `orchestrator.createSession({...})`
3. `useSessionOrchestrator.createSession()` normalizes config, calls `initSession()`
4. `initSession()` tries Edge Function `generate-questions`; falls back to `localQuestionBank`
5. Session starts, user goes to `/app/mock/session` (MockSession.tsx)
6. After completing, navigates to `/app/scorecard/:sessionId` (Scorecard.tsx)

**The mock session always works** even without AI API keys configured — it uses 90+ curated local questions as fallback.

## Key Bug Fixes Applied

1. `VITE_SUPABASE_ANON_KEY` added to `.env` (28 edge function calls were using undefined auth)
2. `orchestrator.createSession()` added — was missing, causing mock sessions to silently fail
3. `orchestrator.currentQuestionIndex` + `currentTimeLimit` exported (MockSession.tsx used these)
4. `generate-questions` edge function created (was called but didn't exist)
5. Local question bank created as fallback (mock sessions work without API keys)
6. `Scorecard` route added to router (page existed but wasn't routed)
7. `/auth/callback` route + `AuthCallback.tsx` created (OAuth redirects were hitting 404)
8. Navigation fixed: `completeSession()` → `/app/scorecard/:id` (was `/scorecard/:id`)
9. `#overlay-root` div added to `index.html` (overlay portal was rendering into void)
10. `OverlayWindow.tsx` rewritten with `getElementById` portal pattern (removed broken `useRef` + stray backtick)
11. `useSpeechRecognition.ts` fully implemented with Web Speech API (continuous, auto-restart, mute/unmute)
12. `useFillerWordDetection`, `useWPMTracker`, `useSentimentAnalysis` — all rewritten to match MockSession.tsx API shapes
13. `useDeepgramStream.ts` wired to real `DeepgramStreamClient`; `deepgram-token` edge function created
14. `MockSession.tsx` credit key fixed (`"live_hint"` not `"liveHint"`), Scorecard navigation fixed
15. React Router v7 `startTransition` warning suppressed in `main.tsx`
16. `userStore.ts` confirmed as a re-export of `authStore` (no duplicate state)

## Zustand Anti-Pattern Fixes (Session 2)

**Rule**: NEVER call `useStore()` without a selector in components that re-render frequently (live sessions, timer ticks, audio updates). Always use `useStore((s) => s.field)` for reactive state, and `useStore.getState().action()` inside callbacks/effects.

**Files fixed** (bare `useStore()` replaced with individual selectors):
- `LiveSessionController.tsx` — `useSessionStore()` / `useOverlayStore()` → individual selectors (was causing infinite re-render / Maximum update depth)
- `useSessionOrchestrator.ts` — all actions now call `.getState()` inside callbacks
- `useLiveCopilot.ts` — same pattern
- `useAudioCapture.ts` — stable callbacks via `.getState()`
- `useAudioSession.ts` — individual selectors for return values
- `OverlayKeyboardHandler.tsx` — individual selectors
- `WindowVisibilityManager.tsx` — individual selectors
- `LivePanicButton.tsx` — individual selectors
- `LiveMetricsPanel.tsx` — individual selectors
- `useOfflineFallback.ts` — individual selectors
- `LiveAIFeedback.tsx` — fixed `audioStore.transcript` / `audioStore.elapsedTime` references → individual selectors
- `OverlaySettings.tsx` — `useOverlayStore()` → individual selectors; actions use `.getState()`
- `MockSession.tsx` — `useOverlayStore()` → individual selectors for `hint_state` / `current_hint_text`
- `LiveRehearsal.tsx` — `useSessionStore()` / `useOverlayStore()` → individual selectors; all actions via `.getState()`
- `LiveCopilot.tsx` — `useOverlayStore()` → 7 individual selectors; all actions via `.getState()`

## What User Must Do for Full Features

### Required (database)
1. Open Supabase Dashboard → SQL Editor
2. Paste and run: `supabase/migrations/20260321000000_add_missing_tables.sql`
3. This creates 28 tables: answer_bank, analytics, company_research, documents, notifications, feature_flags, user_badges, weekly_challenges, scheduled_interviews, interview_rounds, practice_rooms, scorecards, session_debriefs, transcripts, subscriptions, etc.

### Required for AI features
4. Supabase Dashboard → Project Settings → Edge Functions → Add secrets:
   - `GEMINI_API_KEY` (Google AI Studio — free tier available)
   - `OPENAI_API_KEY` (or leave blank, Gemini is the fallback)
5. Deploy edge functions: `npx supabase functions deploy --project-ref qzgvjrvtkwlzxpmlddkx`

### Optional
6. Stripe keys for billing features
7. Deepgram API key for real-time speech transcription
8. PostHog key for product analytics
