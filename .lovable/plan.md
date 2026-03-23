

# Complete Project Audit Report + Implementation Plan

## Part 1: Database Audit

### Live Database Tables (22 tables exist)
`achievements`, `admin_audit_log`, `answers`, `coaching_context`, `companies`, `credit_transactions`, `debriefs`, `documents`, `feature_flags`, `interviews`, `model_cost_logs`, `model_pricing`, `notifications`, `profiles`, `referrals`, `room_participants`, `rooms`, `session_ai_interactions`, `session_transcripts`, `sessions`, `subscriptions`, `user_achievements`

### Tables Defined in Migrations but MISSING from Live DB (27 tables)

| # | Missing Table | Migration File | Frontend Files That Query It |
|---|---|---|---|
| 1 | `answer_bank` | `20260321000000` | useDocuments.ts, OverlayHintPanel.tsx |
| 2 | `analytics` | `20260321000000` | useAnalytics.ts |
| 3 | `company_research` | `20260321000000` | CompanyResearch.tsx, CompanyProfile.tsx |
| 4 | `job_descriptions` | `20260321000000` | useDocuments.ts |
| 5 | `resumes` | `20260321000000` | useDocuments.ts |
| 6 | `feedback` | `20260321000000` | useScorecard.ts |
| 7 | `scorecards` | `20260321000000` | useAnalytics.ts, useScorecard.ts |
| 8 | `session_answers` | `20260321000000` | SessionDetail.tsx |
| 9 | `session_debriefs` | `20260321000000` | useSessionContext.ts |
| 10 | `transcripts` | `20260321000000` | useSessionContext.ts |
| 11 | `user_badges` | `20260321000000` | useXPSystem.ts |
| 12 | `weekly_challenges` | `20260321000000` | useGamification.ts |
| 13 | `scheduled_interviews` | `20260321000000` | useInterviewScheduler.ts |
| 14 | `interview_rounds` | `20260321000000` | useInterviewScheduler.ts |
| 15 | `practice_rooms` | `20260321000000` | useRoom.ts, NewRoom.tsx, PracticeRooms.tsx, RoomSession.tsx |
| 16 | `room_chat` | `20260321000000` | useRoom.ts |
| 17 | `room_questions` | `20260321000000` | useRoom.ts |
| 18 | `calendar_integrations` | `20260321000000` | useCalendarSync.ts |
| 19 | `saved_answers` | `20260321000000` | useDocuments.ts |
| 20 | `credits` | `20260321000000` | (ledger table) |
| 21 | `questions` | `20260323000000` | AppSidebar.tsx, all mock-test pages |
| 22 | `exam_papers` | `20260323000000` | ExamPapers.tsx |
| 23 | `mock_tests` | `20260323000000` | MockTestHub.tsx, TestSession.tsx, TestResults.tsx, TestAnalytics.tsx |
| 24 | `test_responses` | `20260323000000` | TestSession.tsx |
| 25 | `test_analyses` | `20260323000000` | MockTestHub.tsx, TestResults.tsx, TestAnalytics.tsx |
| 26 | `revision_list` | `20260323000000` | TestRevision.tsx |
| 27 | `user_topic_performance` | `20260323000000` | TestAnalytics.tsx |

### Missing RPC Functions
- `refund_credits` — defined in migration `20260323010000` but not in live DB. Called by `useCredits.ts`.

### Table Naming Conflicts
- Live DB has `rooms` table; code references `practice_rooms` (migration creates `practice_rooms`)
- Live DB has `room_participants`; code references both `room_participants` and `practice_room_participants` (RoomSession.tsx line 60)
- The `practice_rooms` migration would conflict with existing `rooms` table — they serve the same purpose but have different schemas

### Missing Foreign Keys
The live DB has **zero enforced foreign keys** on any table. All user_id, session_id, etc. columns exist but lack FK constraints. The migrations define FKs like `sessions.user_id -> auth.users`, `room_participants.room_id -> practice_rooms`, etc.

---

## Part 2: Edge Functions Audit

### Deployed Functions (28)
`ai-coach-chat`, `ai-feedback`, `analyze-test-performance`, `cancel-subscription`, `company-research`, `create-checkout`, `create-test`, `deepgram-token`, `delete-account`, `disconnect-calendar`, `export-user-data`, `generate-debrief`, `generate-hint`, `generate-practice-questions`, `generate-questions`, `generate-star-answer`, `parse-question-pdf`, `parse-resume`, `polish-star-section`, `prep-tool`, `resume-subscription`, `schedule-interview`, `select-test-questions`, `send-email`, `stripe-webhook`, `submit-test`, `sync-calendar`

### Referenced in apiEndpoints.ts but NOT Deployed

| Function in Code | Deployed As | Issue |
|---|---|---|
| `generate-answer` | — | Missing entirely |
| `generate-feedback` | `ai-feedback` | Name mismatch |
| `generate-rephrase` | — | Missing |
| `generate-coach-reply` | `ai-coach-chat` | Name mismatch |
| `coding-hint` | — | Missing |
| `system-design-guide` | — | Missing |
| `analyze-resume` | `parse-resume` | Name mismatch |
| `process-audio` | — | Missing |
| `create-checkout-session` | `create-checkout` | Name mismatch |
| `create-customer-portal` | — | Missing |
| `purchase-credits` | — | Missing |
| `send-invite` | — | Missing |
| `verify-byok` | — | Missing (called by SettingsBYOK.tsx) |
| `send-notification` | — | Missing |
| `flush-analytics` | — | Missing |
| `sync-session` | — | Missing |

---

## Part 3: Frontend Connection Audit

### Broken Queries (tables don't exist)

| File | Queries | Issue |
|---|---|---|
| `useDocuments.ts` | `resumes`, `job_descriptions`, `saved_answers`, `answer_bank` | 4 missing tables |
| `useAnalytics.ts` | `scorecards` | Missing table |
| `useCalendarSync.ts` | `calendar_integrations` | Missing table |
| `useRoom.ts` | `practice_rooms`, `room_participants`, `room_chat`, `room_questions` | Missing tables |
| `useInterviewScheduler.ts` | `scheduled_interviews`, `interview_rounds` | Missing tables |
| `useGamification.ts` | `weekly_challenges` | Missing table |
| `useXPSystem.ts` | `user_badges` | Missing table |
| `useScorecard.ts` | `scorecards`, `feedback` | Missing tables |
| `useSessionContext.ts` | `session_answers`, `session_debriefs`, `transcripts` | Missing tables |
| `AppSidebar.tsx` | `questions` | Missing table |
| All mock-test pages | `questions`, `mock_tests`, `exam_papers`, `test_analyses`, `revision_list`, `user_topic_performance` | Missing tables |

### Broken Column References

| File | Issue |
|---|---|
| `referrals.ts` | Uses `referee_id` — actual column is `referred_id`; uses `code` — column doesn't exist; missing required `referred_email` |
| `AdminDashboard.tsx` | Queries `profiles.plan` — actual column is `plan_id` |
| `RoomSession.tsx` | Queries `practice_room_participants` — actual table is `room_participants` |
| `SettingsNotifications.tsx` | Updates `notification_prefs` — column doesn't exist on profiles |

---

## Implementation Plan

### Step 1: Create All 27 Missing Tables + refund_credits RPC (Database Migration)
Run the two existing migration files as a single migration. Both use `IF NOT EXISTS` / `CREATE OR REPLACE` so they're safe. This creates:
- All 27 tables with RLS policies and indexes
- The `refund_credits` RPC
- The `answer_bank.is_favourite` column
- The `update_topic_performance` RPC

### Step 2: Fix Frontend Column Mismatches (Code Changes)
- `referrals.ts`: Change `referee_id` → `referred_id`, remove `code`, add `referred_email`
- `RoomSession.tsx`: Change `practice_room_participants` → `room_participants`
- `AdminDashboard.tsx`: Change `plan` → `plan_id`
- `SettingsNotifications.tsx`: Remove non-existent `notification_prefs` update

### Step 3: Fix Edge Function Name Mismatches in apiEndpoints.ts
Update `EDGE_FUNCTIONS` constants to match deployed names:
- `GENERATE_FEEDBACK` → `ai-feedback`
- `GENERATE_COACH_REPLY` → `ai-coach-chat`
- `RESUME_ANALYSIS` → `parse-resume`
- `CREATE_CHECKOUT` → `create-checkout`

### Step 4: Remove @ts-nocheck from Files
After tables are created and types regenerated, remove `// @ts-nocheck` from all files that were suppressed only because of missing table types.

### Step 5: Create Missing Edge Function Stubs
Create minimal edge functions for the most critical missing ones:
- `verify-byok` (used by SettingsBYOK.tsx)

The other missing functions (`coding-hint`, `system-design-guide`, etc.) can remain as future work since they require AI API keys to function.

---

## Priority Order
1. **Database migration** — unblocks all 27 missing tables + RPCs (Step 1)
2. **Column/table name fixes** — fixes runtime errors (Step 2)
3. **apiEndpoints alignment** — fixes edge function calls (Step 3)
4. **Type regeneration + @ts-nocheck removal** — automatic after Step 1 (Step 4)
5. **Edge function stubs** — optional polish (Step 5)

