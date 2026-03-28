

# Clarify AI — Full Application Audit Report

## Edge Function Status

### 🔴 CRITICALLY BROKEN (4 functions — wrong file content)

| Function | Actual Content | Impact |
|---|---|---|
| `create-test/index.ts` | Contains `resume-subscription` code | Mock Test creation completely broken |
| `stripe-webhook/index.ts` | Contains `send-email` code | All Stripe payment webhooks broken — subscriptions, credit purchases won't process |
| `generate-hint/index.ts` | Contains `generate-debrief` code | Live interview hints broken |
| `send-email/index.ts` | Line 1 corrupted (double comment + broken import of `cors.ts`) | Email sending will crash on deploy |

### 🟠 CORRUPTED BUT PARTIALLY FUNCTIONAL (2 functions)

| Function | Issue |
|---|---|
| `select-test-questions/index.ts` | Line 1 is corrupted — two comments merged with a broken import statement. Missing `import { createServiceClient }` and `handleCors`. Will crash on deploy. |
| `send-email/index.ts` | Line 1 has duplicate/broken comment-import merge. May crash depending on Deno parser behavior. |

### ✅ WORKING EDGE FUNCTIONS (25 functions)

`ai-coach-chat`, `ai-feedback`, `analytics-dashboard`, `analyze-test-performance`, `cancel-subscription`, `company-research`, `create-checkout`, `deepgram-token`, `delete-account`, `disconnect-calendar`, `export-user-data`, `gap-analysis`, `generate-debrief`, `generate-practice-questions`, `generate-questions`, `generate-star-answer`, `parse-question-pdf`, `parse-resume`, `polish-star-section`, `prep-tool`, `resume-subscription`, `schedule-interview`, `submit-test`, `sync-calendar`, `validate-api-key`

---

## CORS Issue (Affects ALL edge functions)

`_shared/cors.ts` line 5 sets `PROD_ORIGIN` to `https://confideq.app`. Your actual domains are `clarify.ai.sltfinanceindia.com` and `clarify-aii.lovable.app`. Since `ENV` is not `"dev"`, CORS will **block all frontend requests in production**. Fix: change to `"*"` or add both domains.

---

## Frontend Feature Audit

### ✅ FUNCTIONAL (19 features)
1. Auth — Login, signup, logout, password reset
2. Dashboard — Stats cards, recent sessions, credit balance
3. Session History — Loads sessions correctly (fixed in prior iteration)
4. Profile Settings — Edit name, bio, avatar
5. Appearance Settings — Theme toggle
6. Notification Settings — Toggle email notifications
7. BYOK Settings — Save API key hints
8. Privacy/Terms pages — Render correctly
9. Cookie Consent banner — Shows and persists
10. Pricing page — Unified pricing displayed
11. Blog / Help Center — Content renders
12. Keyboard Shortcuts page — Renders
13. 404 page — Styled correctly
14. Mock Test Hub — Navigation works
15. Excel Import — Template download + upload parsing (new)
16. Test Configure — Level presets + settings (new)
17. Exam Papers catalog — Renders (new)
18. Admin Seed Questions — Renders for admins (new)
19. Document Vault — Upload/list resumes and JDs

### 🟡 PARTIALLY FUNCTIONAL (11 features — depend on edge functions or missing API keys)
1. **Live Co-Pilot** — UI works, but Deepgram transcription requires `DEEPGRAM_API_KEY` secret
2. **AI Coach Chat** — Requires `GEMINI_API_KEY` secret + queries `interview_sessions` table (not `sessions`)
3. **AI Feedback** — Requires `GEMINI_API_KEY` + queries `interview_sessions` table
4. **STAR Builder** — Requires `OPENAI_API_KEY` secret
5. **Company Research** — Requires `GEMINI_API_KEY` secret
6. **Prep Lab tools** — Requires `GEMINI_API_KEY` secret
7. **Resume Parsing** — Requires `GEMINI_API_KEY` + `ANTHROPIC_API_KEY`
8. **Billing/Checkout** — Requires `STRIPE_SECRET_KEY` + Stripe price IDs + `PUBLIC_URL` env var
9. **Calendar Sync** — Requires Google OAuth refresh token infrastructure
10. **Mock Test Session** — Test-taking UI works, but `create-test` edge function is broken (contains wrong code)
11. **Email notifications** — `send-email` function has corrupted imports

### 🔴 NON-FUNCTIONAL (8 features — broken code or missing infrastructure)
1. **Create Mock Test** — `create-test/index.ts` contains `resume-subscription` code
2. **Stripe Webhooks** — `stripe-webhook/index.ts` contains `send-email` code — payments won't process
3. **Generate Hints** — `generate-hint/index.ts` contains debrief code
4. **Select Test Questions** — Corrupted imports on line 1
5. **Analytics Dashboard (admin)** — Works but data depends on sessions existing
6. **Practice Rooms** — Real-time room functionality requires WebSocket infrastructure not yet implemented
7. **Referral System** — UI exists but referral tracking/credit awarding is stub-only
8. **Gamification badges** — Achievement system tables exist but no trigger/logic to award them

---

## Implementation Plan

### Tier 1 — Fix Critical Edge Functions (6 files)

1. **Fix `_shared/cors.ts`**: Change `PROD_ORIGIN` to `"*"` (or a comma-separated allowlist) so frontend requests work

2. **Rewrite `create-test/index.ts`**: Currently contains resume-subscription code. Must be rewritten as a proper test creation function that:
   - Authenticates user
   - Accepts test config (exam_type, subjects, difficulty distribution, question count, duration)
   - Calls `select-test-questions` or queries `questions` table directly
   - Creates a `mock_tests` row and returns test ID

3. **Rewrite `stripe-webhook/index.ts`**: Currently contains send-email code. Must be rewritten to:
   - Verify Stripe webhook signature
   - Handle events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`
   - Update `subscriptions` and `profiles` tables accordingly

4. **Rewrite `generate-hint/index.ts`**: Currently contains debrief code. Must be a lightweight hint generator:
   - Accept question + transcript context
   - Return 3 bullet-point hints (not full answer)
   - Use Gemini Flash for speed

5. **Fix `select-test-questions/index.ts` line 1**: Repair the corrupted import line to properly import `handleCors`, `corsHeaders`, `createServiceClient`

6. **Fix `send-email/index.ts` line 1**: Repair the corrupted double-comment import line

### Tier 2 — Fix Table References

Several edge functions query `interview_sessions` (e.g., `ai-coach-chat`, `ai-feedback`) but the actual table is `sessions`. These need to be updated.

### Tier 3 — Deploy All Functions

After fixes, deploy all 31 edge functions.

---

## Summary Counts

| Category | Count |
|---|---|
| Total edge functions | 31 |
| Critically broken (wrong content) | 4 |
| Corrupted imports | 2 |
| Working but need API keys | 25 |
| Frontend features functional | 19 |
| Frontend features partially functional | 11 |
| Frontend features non-functional | 8 |
| **Total non-functional features** | **8** |
| **Total features needing API keys to work** | **11** |

