# Clarify AI — Interview Preparation & Live Practice Coach

AI-powered interview preparation for students and job seekers: mock sessions, live practice coaching, prep tools, analytics, and secure document management.

**Practice only.** Clarify AI is built for mock interviews and rehearsal. It must not be used to conceal assistance during real, graded, or employer interviews.

---

## Key features

### Live practice coach
- Real-time AI hints and answers (OpenAI, Anthropic, Gemini)
- Live transcription via Deepgram
- Streaming responses and keyboard shortcuts
- **Calm steps** — instant grounding prompts when you feel stuck
- Session timer and network status

### Practice overlay
- Floating overlay for mock and live **practice** sessions
- Resizable, dockable UI with resume/JD context
- **Discrete UI** (optional): neutral nav labels for private practice — does **not** hide the app from screen sharing
- Screen-sharing awareness notices (capture evasion disabled by policy)

### Audio & speech
- Speech-to-text, filler-word detection, WPM tracking
- Speaker diarization and silence detection (where supported)
- System audio capture for practice tabs (Chromium)

### Prep Lab
- STAR builder, rephraser, coding hints, system design, project builder
- Company research, answer bank, resume/JD management

### Analytics & gamification
- Scorecards, debriefs, confidence trends
- XP, streaks, badges
- Analytics dashboard (server-side aggregates)

### Scheduling & sessions
- Interview scheduler, Google Calendar sync (when configured)
- Mock interviews, warm-ups, session history

### Billing & security
- Credits and Stripe subscriptions (Free / Pro / Enterprise)
- Supabase Auth, RLS, GDPR export/delete
- BYOK (bring-your-own-key) is on the roadmap — `/app/settings/byok` shows deprecation notice; managed provider keys only at launch
- Private/offline mode for sensitive practice

---

## Tech stack

| Layer | Stack |
|--------|--------|
| Frontend | React, TypeScript, Vite, Tailwind, shadcn/ui, Zustand |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions) |
| AI | OpenAI, Anthropic, Gemini via Edge Functions |
| Audio | Deepgram, Web Audio API |
| Payments | Stripe |

See `docs/README.md`, `docs/API.md`, and `docs/PRODUCTION_AUDIT_2026-05-25.md` for deeper documentation.

---

## Local development

```bash
npm install
cp .env.example .env   # fill Supabase + API keys
npm run dev
```

```bash
npm run build
npm test
```

---

## Deployment checklist

1. Set Supabase secrets: `GEMINI_API_KEY`, `DEEPGRAM_API_KEY`, `STRIPE_*`, Google OAuth (calendar).
2. Deploy Edge Functions: `supabase functions deploy`.
3. Run migrations on the linked project.
4. Enable leaked-password protection in Supabase Auth.

---

## Compliance note

Screen-capture exclusion, overlay hiding from interviewers, and anti-detection behaviour are **disabled** in production builds. See `src/lib/compliance/featureGates.ts`.

---

## License

Proprietary — Clarify AI. See repository maintainers for terms.
