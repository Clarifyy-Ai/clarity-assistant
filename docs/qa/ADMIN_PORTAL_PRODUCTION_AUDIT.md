# Admin portal — production audit

Generated: 2026-09-03 (agent-assisted full pass)

Project: `qzgvjrvtkwlzxpmlddkx` · App: `https://trycareerpilot.com` · Python: `https://clarity-assistant-az05.onrender.com`

## Summary

| Area | Status |
|------|--------|
| Routes vs nav (29 items) | **PASS** — all nav links resolve |
| Vitest admin smokes | **PASS** — AdminAnalytics, AdminMail (12 tests) |
| Edge deploy blockers | **FIXED** — `hostinger-mail`, `moderate-content` allowlisted + deployed |
| Render / Python | **PASS** — `/health` + `/ready` 200, CORS for trycareerpilot.com |
| HMAC Edge↔Render | **PASS** — signed internal probe 200 |
| Layout consistency | **PARTIAL** — mobile nav parity fixed; some pages still use custom `h1` |

## Page inventory (29 nav routes)

| Section | Page | Route | Backend | Prod risk |
|---------|------|-------|---------|-----------|
| Users | Users | `/app/admin/users` | `profiles`, `user_roles`, RPC `bulk_update_users` | Medium |
| Users | Live Support | `/app/admin/live-chat` | `support-chat`, support tables | Medium |
| Users | Support | `/app/admin/support` | `support_threads` read | Medium |
| Users | Mail | `/app/admin/mail` | `hostinger-mail` | **OK** (deployed) |
| Users | Audit Log | `/app/admin/audit-log` | `admin_audit_log` | Medium |
| Content | Questions | `/app/admin/questions` | `questions` CRUD | Medium |
| Content | Bulk Upload | `/app/admin/bulk-upload` | `parse-question-pdf`, Gemini | High if no Gemini |
| Content | Seed / Import | `/app/admin/seed-questions` | `collect-exam-papers`, scraper | High if no scraper URL |
| Content | Community | `/app/admin/community` | `moderate-content` | **OK** (deployed) |
| Content | Learning Hub | `/app/admin/learning` | learning schema tables | Medium |
| Content | Blog | `/app/admin/blog` | `blog_posts`, storage | Medium |
| Content | Help Articles | `/app/admin/help-articles` | `help_articles` | Medium |
| Gov | Sources | `/app/admin/gov/sources` | gov tables via `adminOps` | Medium |
| Gov | PDF Ingest | `/app/admin/gov/ingest` | `extract-question-paper` | High |
| Gov | Exam Registry | `/app/admin/gov/exams` | gov registry + RPC readiness | Medium |
| Gov | Q Review | `/app/admin/gov/question-review` | questions + reviews | Medium |
| Gov | Paper Review | `/app/admin/gov/paper-review` | `gov_generated_papers` | Medium |
| Gov | Paper Factory | `/app/admin/gov/paper-factory` | scraper + `process-paper-generation-job` | High |
| Gov | Translations | `/app/admin/gov/translations` | `question_translations` | Medium |
| Gov | Auto-Approval | `/app/admin/gov/auto-approval` | auto-approval rules tables | Medium |
| Billing | Revenue | `/app/admin/revenue` | billing tables | Medium |
| Billing | Offers | `/app/admin/promo-codes` | `promo_codes` | Medium |
| Billing | Billing | `/app/admin/billing-settings` | `billing_settings` | Medium |
| System | Dashboard | `/app/admin` | analytics tables + health strip | Medium |
| System | Analytics | `/app/admin/analytics` | admin RPCs + tables | Medium |
| System | Feature Flags | `/app/admin/feature-flags` | `feature_flags` | Medium |
| System | Diagnostics | `/app/admin/diagnostics` | hybrid-health, ai-key-check, ai-hub | Medium |
| System | Model Costs | `/app/admin/model-costs` | `ai_usage_logs`, pricing | Medium |
| System | AI Hub | `/app/admin/ai-hub` | `ai-hub-router` | High without AI keys |

### Hidden routes (not in nav)

| Route | Purpose |
|-------|---------|
| `/app/admin/questions/:id` | Question editor detail |
| `/app/admin/blog/preview/:id` | Blog draft preview |
| `/app/admin/help-articles/preview/:id` | Help draft preview |
| `/app/admin/qa-checklist` | Redirect → diagnostics |
| `/app/admin/security-config` | Redirect → diagnostics |

## Fixes applied this audit

1. `hostinger-mail` + `moderate-content` added to `REMOTE_FUNCTION_ALLOWLIST.txt` and deployed to Supabase.
2. `AdminLayout` — mobile sheet footer (Back to app, Help docs) + branding aligned with desktop.
3. `AdminDashboard` — removed page-level horizontal scroll; empty state for recent signups.
4. `schedule-interview` — Hostinger-first email (prior session).
5. Render `CORS_ORIGINS` — trycareerpilot.com + clarify.ai (prior session).

## Manual verification checklist

Sign in as admin on production, then visit each nav item:

- [ ] Dashboard loads KPIs + health strip (no infinite spinner)
- [ ] Users — search, plan filter, bulk actions
- [ ] Live Support — thread list loads
- [ ] Mail — status shows **Configured**, folders list
- [ ] Community — moderate hide/restore works
- [ ] Gov Paper Factory — scraper banner absent when `VITE_SCRAPER_URL` set
- [ ] Diagnostics — Gemini + Deepgram green; Python connected
- [ ] Feature Flags — toggle saves
- [ ] Mobile — hamburger nav shows all sections + footer links

## Ops commands

```bash
node --use-system-ca scripts/verify-render-health.mjs
node --use-system-ca scripts/smoke-ai-remediation.mjs
npx vitest run src/test/pages/app/admin/
```

## Remaining gaps (non-blocking)

- **Layout:** ~17 pages use custom `h1` instead of `PageHeader` (cosmetic).
- **Tests:** Only 2 of 31 admin pages have Vitest smoke tests.
- **RAZORPAY_WEBHOOK_SECRET:** Revenue webhooks incomplete until set.
- **AdminQAChecklist.tsx:** Orphan component; route redirects to Diagnostics.
- **CI parity:** `end-session` retired-410 stub check still fails (pre-existing).
