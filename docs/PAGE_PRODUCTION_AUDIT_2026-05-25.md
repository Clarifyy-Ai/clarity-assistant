# Per-page production audit (2026-05-25)

Full pass over public, auth, onboarding, user portal (`/app/*`), and admin (`/app/admin/*`). Fixes are in `main` after this commit.

---

## Summary

| Surface | Routes | Status |
|---------|--------|--------|
| Marketing | 9 public routes | **Fixed** — help slugs, footer, enterprise CTA, signup plan storage |
| Auth | login, signup, verify, reset, callback | **Fixed** — OAuth errors on login, `?plan=` persisted |
| Onboarding | 5 steps | **Fixed** — coach_tone save, errors block advance, finish gate, profile wait |
| User portal | ~70 `/app/*` | **Fixed** — companies/JD/prep links, notifications, referrals, answer bank |
| Admin | 8 admin pages | **Fixed** — DAU math, model cost bucketing; deploy migrations |

---

## Fixes by area

### Auth & guards
- `ProtectedRoute`: wait for `isProfileLoaded` before `/app` when `requireOnboarded`
- `Login`: show `?message=` / `?error=` from OAuth callback
- `Signup`: store valid `?plan=` in `localStorage` (`clarify_pending_plan`)

### Onboarding
- Step 3: save `coach_tone`, toast + block on DB error
- Index: redirect when `isOnboarded` after profile loads; do not complete wizard if finish save fails

### Marketing
- `HelpArticle` `bi-2` matches Help pricing FAQ; added `bi-5` for extra credits
- Footer “Getting started” → `/help/getting-started`
- Enterprise CTA → `mailto:sales@clarifyai.com` (not fake signup plan)

### User portal
- `companyProfilePath()` helper; `CompanyProfile` uses `:id` param
- `CompanyResearch` honors `?q=`; `InterviewDetail` / `JDDetail` company links fixed
- `PrepLab` opens AI Tools + `jd_fit` from `?tool=jd_fit`
- `Notifications`: load errors, mark-all-read fallback, removed duplicate `deleteNotification`
- `Referrals` / `AnswerBank`: Supabase error toasts

### Admin
- `AdminAnalytics`: DAU uses latest day row; “active users” = peak DAU in range
- `AdminModelCosts`: bucket by `action` not missing `description` column

### Migrations (apply on Supabase)
- `20260525140000_page_audit_grants.sql` — `mark_notifications_read` grant, `mock_tests` admin SELECT

---

## Still partial (document, not bugs)

- Practice rooms: chat only (no WebRTC)
- Google Calendar: needs OAuth secrets
- BYOK: route removed at launch
- Settings → AI models: “coming soon”
- Admin revenue: estimates until Stripe history wired
- Empty gov exam question bank until admin seed

---

## Pre-launch checklist

1. `npx supabase db push` (all migrations including `20260525120000`, `20260525140000`)
2. Deploy edge functions
3. Set production secrets (`STRIPE_*`, `GEMINI_*`, `DEEPGRAM_*`, `SYSTEM_USER_ID`)
4. `npm ci && npm run build`
5. Smoke: signup → onboarding → mock → scorecard → company brief → admin user ban
