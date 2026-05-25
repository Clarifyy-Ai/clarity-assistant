# Full application production audit (2026-05-25)

Master checklist for **public/marketing**, **user portal** (`/app/*`), and **admin portal** (`/app/admin/*`). Code fixes in this pass are listed under §4.

---

## 1. Surface map

| Surface | Entry | Auth |
|---------|-------|------|
| Marketing | `/`, `/pricing`, `/blog`, `/help`, legal | Public |
| Auth | `/login`, `/signup`, `/auth/callback` | Public |
| Onboarding | `/onboarding/*` | Authenticated |
| User app | `/app/*` (~70 routes) | `ProtectedRoute` |
| Admin | `/app/admin/*` | `has_role(admin)` + layout guard |
| Overlay | Electron / `overlay` route | Session + consent |

---

## 2. Status by area (2026-05-25)

### Public / marketing — **READY** (with env)

- Landing, pricing, blog, help: static; CTAs → `/signup`, `/login`.
- No fabricated live user counts in audited paths.
- **Needs:** production `VITE_*` URLs, Stripe price IDs for checkout CTAs.

### Auth / onboarding — **READY**

- Supabase Auth + email verify + OAuth callback.
- Onboarding writes `profiles`; banned users blocked in `ProtectedRoute`.

### User portal — **READY** (feature-gated by plan + credits)

| Module | Route | Notes |
|--------|-------|-------|
| Dashboard | `/app/dashboard` | KPIs, billing link fixed |
| Live co-pilot | `/app/live/*` | Credits via edge; no double deduct |
| Mock interview | `/app/mock/*` | Scorecard → `/app/scorecard/:id` |
| Prep Lab | `/app/prep/*` | Edge `fetchEdgeJson`; bank + company research |
| Gov mock tests | `/app/mock-test/*` | Configure, papers, results; CSV template in `public/` |
| Analytics | `/app/analytics` | Server aggregates |
| Settings | `/app/settings/*` | Nav includes billing, models, security |
| Debrief / referrals / interview-day | routes exist | Added to sidebar |
| Practice rooms | `/app/rooms` | Chat only; beta copy |
| Billing | `/app/settings/billing` | Stripe EFs need secrets |

### Admin portal — **READY** (this pass)

| Page | Fix |
|------|-----|
| Users | `plan_id`, `is_banned`, `bulk_update_users`, `user_roles` for admin |
| Dashboard | `plan_id` in recent signups; removed fake KPI deltas |
| Revenue | `plan_id` column; churn/MRR growth = 0 until historical series |
| Feature flags | Persist toggles to `feature_flags` table |
| Seed questions | PDF envelope unwrap; real gap-fill via `select-test-questions` |
| Model costs | Real `credit_transactions` only (prior pass) |

### Compliance / overlay — **READY**

- `SCREEN_CAPTURE_EVASION_ENABLED = false`
- Discrete UI; compliance banner; no stealth hotkey duplication

---

## 3. Database / edge (deploy before prod)

| Item | Action |
|------|--------|
| `20260525120000_admin_production_fixes.sql` | Apply: `bulk_update_users` grant + `questions` admin RLS |
| `select-test-questions` source-type fix | Deploy edge function |
| `SYSTEM_USER_ID` secret | Required for AI gap-fill + generated questions |
| `increment_profile_credits` | **service_role only** — admins use `bulk_update_users` |
| Question bank | Seed via admin Excel/CSV/PDF or gap-fill |

---

## 4. Fixes applied (pass — full app, 2026-05-25)

| ID | Area | Fix |
|----|------|-----|
| F-01 | Admin users | Rewrite: `plan_id`, ban via `is_banned`, credits/plan via `bulk_update_users`, admin via `user_roles` |
| F-02 | Migration | Grant `bulk_update_users` to `authenticated`; admin ALL on `questions` |
| F-03 | Admin dashboard | `plan_id` select; remove fake trend deltas |
| F-04 | Admin revenue | `plan_id` not `plan`; zero placeholder growth/churn |
| F-05 | Admin feature flags | Save/load `feature_flags` table |
| F-06 | Admin seed | PDF `unwrapEdgePayload`; gap-fill calls edge |
| F-07 | Scorecard | Links `/app/dashboard`, `/app/analytics` |
| F-08 | Settings nav | Billing, models, security |
| F-09 | App sidebar | Debrief, referrals, interview-day |
| F-10 | Mock test import | CSV template + `.csv` upload support |

Prior passes (committed `7b29c01` + uncommitted prep/mock): overlay compliance, mock/live billing, prep lab credits, mock-test configure/results — see `docs/PREP_MOCKTEST_AUDIT_2026-05-25.md`, `docs/MOCK_LIVE_AUDIT_2026-05-25.md`, `docs/OVERLAY_PRODUCTION_AUDIT_2026-05-25.md`.

---

## 5. Remaining for production launch

1. **Apply migration** `20260525120000_admin_production_fixes.sql` on remote Supabase.
2. **Deploy all edge functions** (`scripts/deploy-all-three.mjs` or MCP deploy script).
3. **Secrets:** `STRIPE_*`, `GEMINI_*`, `DEEPGRAM_*`, `SYSTEM_USER_ID`, `ALLOWED_ORIGINS`.
4. **`npm run build`** in CI/local with dependencies installed.
5. **Smoke test:** signup → onboarding → mock session → scorecard → admin user ban/unban.
6. **Commit** uncommitted prep/mock-test + this admin/portal batch.

---

## 6. Quick verification commands

```bash
npm ci
npm run build
npx supabase db push
```

---

*See also: `docs/PRODUCTION_AUDIT_2026-05-25.md` (earlier passes), `docs/SUPABASE_REMOTE_SYNC.md`.*
