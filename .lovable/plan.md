## Goal

Transform the admin portal at `/app/admin` from a basic stats view into a complete control center for Clarify AI. Add real analytics for response times and live chat, full user management actions, a powerful question paper authoring tool that supports inline images placed *anywhere* inside the question (and inside individual options), and round out every existing admin page with the data the user actually needs.

## Scope (5 areas)

### 1. Admin Analytics — full dashboard rewrite (`AdminAnalytics.tsx`)
Replace the current 3-card view with tabbed analytics:
- **Overview**: DAU/WAU/MAU, total sessions, signups/day (14-day bar), retention cohort.
- **Performance / Response Times**: edge-function p50/p95/p99 latency, error rate, slowest 10 functions. Data source: new `request_metrics` table populated by a lightweight logger in `fetchEdge`, plus a `get_admin_perf_stats` RPC that aggregates last 24h / 7d / 30d.
- **AI Usage**: tokens in/out per model, cost USD, credits charged (from existing `model_cost_logs`).
- **Mock Tests**: tests created/submitted per day, avg score, top exam types (from `mock_tests`, `test_responses`).
- **Live Chat / Support**: open vs resolved tickets, avg first-response time, agent leaderboard (depends on chat tables — see #2).
- Period switcher (24h / 7d / 30d / 90d), CSV export per tab.

### 2. Live Chat / Support Console (new `AdminLiveChat.tsx` + tables)
New Supabase tables: `support_threads` (user_id, status, subject, last_message_at, assigned_admin_id) and `support_messages` (thread_id, sender_id, sender_role, body, attachments, created_at). RLS: users see own threads, admins see all.
Admin page features:
- Inbox split-view (threads list ↔ message pane), filters: open/pending/resolved/mine.
- Real-time updates via Supabase channel.
- Reply composer with attachments; quick actions: resolve, reassign, snooze, ban-user.
- KPIs at top: open count, median first-response, avg resolution time.
- (User-side surface is out of scope for this pass — schema + admin console only; we'll wire a user widget in a follow-up.)

### 3. User Management upgrades (`AdminUsers.tsx`)
- Add columns: last_login_at, total_sessions, lifetime credits used.
- Bulk select + bulk actions (grant credits, change plan, ban).
- New actions: reset password (admin-trigger email), impersonate (issue short-lived magic link via edge fn `admin-impersonate`), edit profile fields, view session history drawer, view billing history.
- CSV export of filtered users.
- Audit-log every admin action into existing `admin_audit_log`.

### 4. Question Paper Authoring with inline images (new `AdminQuestionEditor.tsx` + enhanced `AdminSeedQuestions.tsx`)
A real authoring panel for building/editing questions one at a time, in addition to the existing Excel/PDF importers.
- **Block-based question body**: the question is stored as ordered blocks `[{type:'text',content}|{type:'image',url,alt,width}|{type:'latex',tex}]` serialized into `question_html` (Markdown/HTML) and a new `question_blocks` jsonb column. Admin can insert an image *between* paragraphs — exactly the "image in the middle of the question" requirement.
- Toolbar: Add Text, Add Image (drag-drop / paste / file picker, uploaded to `question-images` storage bucket), Add LaTeX, reorder via drag handles, delete.
- **Per-option image support**: each MCQ option (A/B/C/D) gets the same block editor — useful for diagram-based options.
- **Explanation block editor** with the same capabilities.
- Metadata sidebar: subject, topic, subtopic, exam_type, year, difficulty, marks, tags, public/verified toggles.
- Live preview pane showing exactly how the student will see it (renders blocks + KaTeX).
- Save → upserts into `questions` table with normalized `question_text` (plaintext fallback) plus the `question_blocks` jsonb.
- Bulk question browser tab: search/filter existing questions, click to edit, duplicate, delete (admin only via existing RLS).
- New storage bucket `question-images` (public-read, admin-write).

### 5. Round out the rest of the admin portal
- **AdminRevenue**: connect to Stripe-synced `subscriptions` data — MRR, ARR, churn %, new vs churned charts, plan mix donut, recent payments table.
- **AdminModelCosts**: add per-user breakdown, top-10 spenders, budget alerts, model-cost trend.
- **AdminFeatureFlags**: add rollout-percent slider, allowed-users multi-select, audit history, copy-flag-key button.
- **AdminLayout**: add nav entries for new pages (Live Chat, Question Editor), collapse sidebar on mobile, show admin user chip + sign-out.
- **AdminDashboard**: surface new live-chat KPI and perf KPI tiles; replace hardcoded "+12%" deltas with real period-over-period values.

## Technical details

### New / changed tables (one migration)
- `support_threads`, `support_messages` (+ RLS, + realtime publication).
- `request_metrics(id, function_name, status_code, duration_ms, user_id, created_at)` — admin-only RLS.
- `questions` ALTER: add `question_blocks jsonb`, `option_blocks jsonb`, `explanation_blocks jsonb` (nullable; existing rows stay valid).
- Storage: create `question-images` bucket (public read, admin insert/update/delete via policy on `storage.objects`).
- RPCs: `get_admin_perf_stats(p_days int)`, `get_admin_dau_mau(p_days int)`, `bulk_update_users(p_user_ids uuid[], p_patch jsonb)`.

### New edge functions
- `admin-impersonate` — verifies caller is admin via `has_role`, returns a magic-link URL for the target user using service role. Logs to `admin_audit_log`.
- `admin-support-reply` — sends email notification when an admin replies to a thread (uses existing `send-email` infra).
- Update `_shared/fetchEdge` (or a wrapper inside each function) to insert a row into `request_metrics` after every call.

### Frontend
- New components: `BlockEditor.tsx`, `BlockRenderer.tsx`, `ImageUploader.tsx`, `ChatThreadList.tsx`, `ChatMessagePane.tsx`, `BulkActionBar.tsx`, `PerfChart.tsx`.
- Use existing `Card`, `Button`, `Input`, `Modal`, `sonner` toasts. KaTeX for LaTeX preview (already a dep if present; else add `katex`). `dnd-kit` for block reordering (lightweight).
- All admin routes already protected by `<ProtectedRoute requireAdmin>` — keep that pattern.
- Add lazy imports + routes for `/app/admin/live-chat`, `/app/admin/questions` (editor), `/app/admin/questions/:id` (edit one).

### File map (high level)
```text
src/pages/app/admin/
  AdminAnalytics.tsx          (rewrite, tabbed)
  AdminLiveChat.tsx           (new)
  AdminQuestionEditor.tsx     (new — list + create/edit)
  AdminRevenue.tsx            (enhance)
  AdminModelCosts.tsx         (enhance)
  AdminFeatureFlags.tsx       (enhance)
  AdminUsers.tsx              (enhance: bulk, drawer, export)
  AdminDashboard.tsx          (real deltas + new KPIs)
  AdminLayout.tsx             (nav + mobile)
src/components/admin/
  BlockEditor.tsx
  BlockRenderer.tsx
  ImageUploader.tsx
  ChatThreadList.tsx
  ChatMessagePane.tsx
  BulkActionBar.tsx
  PerfChart.tsx
supabase/functions/
  admin-impersonate/
  admin-support-reply/
  _shared/metrics.ts          (request_metrics logger)
supabase/migrations/<ts>_admin_portal.sql
```

## Out of scope (flag for later)
- End-user-facing live-chat widget (only admin console + schema this pass).
- Full WYSIWYG rich-text — block editor is intentionally simple (text/image/latex blocks) to match the "image in middle of question" requirement without bloating the bundle.
- Mobile-optimized question editor (desktop-first; usable but not polished on phones).

## Approval needed
Approving this plan switches me to build mode where I'll: run the migration, deploy the new edge functions, scaffold the new pages/components, and wire everything up. Estimated as one large change set — I'll commit it as a single coherent update so the admin portal lights up end-to-end.