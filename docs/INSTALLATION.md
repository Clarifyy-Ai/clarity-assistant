# Installation & Local Setup

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20 | [nodejs.org](https://nodejs.org) |
| Bun | ≥ 1.1 | `curl -fsSL https://bun.sh/install \| bash` |
| Supabase CLI | ≥ 1.170 | `brew install supabase/tap/supabase` |
| Git | any | — |

---

## 1. Clone the Repository

```bash
git clone https://github.com/your-org/clarify.git
cd clarify
```

---

## 2. Install Dependencies

```bash
bun install
# or: npm install
```

---

## 3. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Note your **Project URL** and **anon key** from
   *Settings → API*
3. Note your **service role key** (keep this secret — edge functions only)

---

## 4. Configure Environment Variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in:

```bash
# Required
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# At least one AI provider
OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# GEMINI_API_KEY=AIza...

# Stripe (optional for local dev — use test keys)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (optional for local dev)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@localhost
```

---

## 5. Apply Database Migrations

```bash
# Link your project
supabase login
supabase link --project-ref your-project-ref

# Push all migrations
supabase db push

# Or reset + reseed for fresh local dev
supabase db reset
```

See [DATABASE.md](./DATABASE.md) for full schema documentation.

---

## 6. Deploy Edge Functions

```bash
# Set secrets in Supabase (server-side only — never VITE_ prefix)
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set GEMINI_API_KEY=AIza...
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...

# Deploy all functions
supabase functions deploy
```

To deploy a single function:

```bash
supabase functions deploy generate-star-answer
```

---

## 7. Start the Dev Server

```bash
bun run dev
# → http://localhost:5173
```

---

## 8. Create Your First Admin User

1. Sign up at `http://localhost:5173/signup`
2. In the Supabase dashboard → Table Editor → `profiles`
3. Set `is_admin = true` for your user row
4. Access the admin panel at `/admin`

---

## Available Scripts

```bash
bun run dev          # Start Vite dev server
bun run build        # Production build → dist/
bun run preview      # Preview production build locally
bun run lint         # ESLint
bun run format       # Prettier write
bun run format:check # Prettier check (CI)
bun run test         # Vitest (watch)
bun run test:run     # Vitest (single run)
bun run test:coverage # Vitest with v8 coverage
bun run test:e2e     # Playwright e2e tests
bun run typecheck    # tsc --noEmit
```

---

## Local Edge Function Development

```bash
# Run functions locally (uses .env.local automatically)
supabase functions serve

# Test a specific function
curl -i --location --request POST \
  'http://localhost:54321/functions/v1/generate-star-answer' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"questionText":"Tell me about a challenge you overcame."}'
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `VITE_SUPABASE_URL` not found | Ensure `.env.local` exists and Vite server was restarted |
| Auth redirect loop | Check `VITE_APP_URL` matches your Supabase allowed redirect URLs |
| Edge function 401 | Pass `Authorization: Bearer <anon_key>` in request headers |
| Stripe webhook fails locally | Use `stripe listen --forward-to localhost:5173/api/webhook` |
| `supabase db push` fails | Run `supabase db reset` to start fresh |
| Tailwind classes not applying | Ensure `content` paths in `tailwind.config.ts` cover all `.tsx` files |
