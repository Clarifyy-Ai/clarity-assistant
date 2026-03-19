# Clarity — Docs

> AI-powered interview copilot. Real-time overlay assistance, mock sessions,
> STAR builder, company research, and deep post-session debriefs.

## Quick Links

| Document | Description |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, data flow, folder structure |
| [INSTALLATION.md](./INSTALLATION.md) | Local setup, env vars, first run |
| [API.md](./API.md) | Edge function reference — endpoints, payloads, responses |
| [DATABASE.md](./DATABASE.md) | Schema, RLS policies, migrations |
| [STEALTH_FEATURES.md](./STEALTH_FEATURES.md) | Overlay, stealth mode, audio capture |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| State | Zustand (authStore, sessionStore, globalStore, audioStore) |
| Backend | Supabase (Postgres, Auth, Storage, Realtime) |
| Edge Functions | Deno (Supabase Edge Runtime) |
| AI Providers | OpenAI, Anthropic, Google Gemini |
| Payments | Stripe (subscriptions + one-time credits) |
| Email | Resend |
| Testing | Vitest (unit) + Playwright (e2e) |
| Hosting | Vite → Lovable / Render; Functions → Supabase |

## Feature Map

```
Clarity
├── Live Copilot      — real-time AI overlay during actual interviews
├── Mock Sessions     — AI interviewer with scoring and feedback
├── Live Rehearsal    — free-form practice with live hints
├── STAR Builder      — AI-generated STAR answers + section polish
├── Prep Lab          — coding hints, system design, rephraser, project builder
├── Company Research  — AI-powered company intelligence cards
├── Answer Bank       — saved and organised answer library
├── Session Debrief   — post-session AI analysis and scoring
├── Documents         — resume + JD vault with AI parsing
├── Practice Rooms    — collaborative peer practice sessions
├── Interview Scheduler — schedule events with AI prep checklists
├── Analytics         — personal performance dashboards
└── Admin Panel       — user mgmt, revenue, feature flags, model costs
```

## Plan Tiers

| Plan | Credits/mo | Key Features |
|---|---|---|
| Free | 20 | Mock sessions, basic STAR |
| Starter | 100 | + Answer bank, prep lab |
| Pro | 400 | + Live overlay, company research, debrief |
| Elite | 1 200 | + All features, priority support |
| Enterprise | Unlimited | + BYOK, coach sessions, white-glove |
