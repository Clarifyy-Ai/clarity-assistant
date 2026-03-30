

# Clarify AI — Comprehensive Application Audit Report

---

## 1. FEATURE INVENTORY — Status by Page/Route

### Auth Pages
| Page | Route | Status | Backend Connected | Notes |
|---|---|---|---|---|
| Login | `/login` | ✅ Working | Yes | Redirects authenticated users |
| Signup | `/signup` | ✅ Working | Yes | Handles email verification flow |
| Verify Email | `/verify-email` | ✅ Working | Yes | — |
| Reset Password | `/forgot-password` | ✅ Working | Yes | — |
| Auth Callback | `/auth/callback` | ✅ Working | Yes | OAuth flow |

### Marketing Pages
| Page | Route | Status | Notes |
|---|---|---|---|
| Landing | `/` | ✅ Working | Does not destroy auth session |
| Pricing | `/pricing` | ✅ Working | Static content |
| Blog/BlogPost | `/blog` | ✅ Working | Static content |
| Help/HelpArticle | `/help` | ✅ Working | Static content |
| Terms/Privacy | `/terms`, `/privacy` | ✅ Working | Static content |
| Shortcuts | `/shortcuts` | ✅ Working | Static content |

### Core App Pages
| Page | Route | Status | Backend | Issue |
|---|---|---|---|---|
| Dashboard | `/app/dashboard` | ✅ Working | Yes | Fetches sessions, profile |
| Analytics | `/app/analytics` | ⚠️ Partial | Yes | Depends on `analytics-dashboard` edge fn + data existing |
| Live Rehearsal | `/app/live` | ⚠️ Partial | Yes | AI answers depend on edge fn + Deepgram token |
| Live Overlay | `/app/live/overlay` | ⚠️ Partial | — | Full-screen overlay, depends on live session active |
| Mock Interview | `/app/mock` | ⚠️ Partial | Yes | AI-generated questions need edge fn |
| Mock Warmup | `/app/mock/warmup` | ⚠️ Partial | Yes | Same dependency |
| Mock Session | `/app/mock/session` | ⚠️ Partial | Yes | Same dependency |
| Mock Test Hub | `/app/mock-test` | ✅ Working | Yes | Lists tests from DB |
| Test Configure | `/app/mock-test/configure` | ✅ Working | Yes | Calls `create-test` edge fn with JWT |
| Test Session | `/app/mock-test/session/:id` | ✅ Working | Yes | Uses JWT auth correctly |
| Test Results | `/app/mock-test/results/:id` | ⚠️ Partial | Yes | `analyze-test-performance` may need AI key |
| Upload Questions | `/app/mock-test/upload` | ✅ Working | Yes | Excel import + PDF parse |
| My Questions | `/app/mock-test/my-questions` | ✅ Working | Yes | Direct Supabase query |
| Exam Papers | `/app/mock-test/papers/:exam` | ✅ Working | Yes | Uses JWT auth |
| PrepLab | `/app/prep` | ⚠️ Partial | Yes | Some tools use anon key, some use JWT |
| STAR Builder | `/app/prep/star-builder` | ⚠️ Partial | Yes | Calls `generate-star-answer` |
| Rephraser | `/app/prep/rephraser` | 🔴 Broken Auth | Yes | Uses `SUPABASE_ANON_KEY` for auth header |
| Coding Hints | `/app/prep/coding-hints` | 🔴 Broken Auth | Yes | Uses `SUPABASE_ANON_KEY` for auth header |
| System Design | `/app/prep/system-design` | 🔴 Broken Auth | Yes | Uses `SUPABASE_ANON_KEY` for auth header |
| Project Builder | `/app/prep/project-builder` | 🔴 Broken Auth | Yes | Uses `SUPABASE_ANON_KEY` for auth header |
| Documents | `/app/documents` | ✅ Working | Yes | — |
| Resume Detail | `/app/documents/resume/:id` | ⚠️ Partial | Yes | No extraction preview/edit UI |
| JD Detail | `/app/documents/jd/:id` | ✅ Working | Yes | — |
| Sessions | `/app/sessions` | ✅ Working | Yes | — |
| Session Detail | `/app/sessions/:id` | ✅ Working | Yes | — |
| Answer Bank | `/app/answers` | ✅ Working | Yes | — |
| Interviews | `/app/interviews` | ✅ Working | Yes | — |
| Company Research | `/app/companies` | ⚠️ Partial | Yes | Uses anon key for auth |
| Company Profile | `/app/companies/:id` | 🔴 Broken Auth | Yes | Uses `SUPABASE_ANON_KEY` |
| Debrief | `/app/debrief` | ⚠️ Partial | Yes | — |
| Debrief Detail | `/app/debrief/:id` | 🔴 Broken Auth | Yes | Uses `SUPABASE_ANON_KEY` |
| Practice Rooms | `/app/rooms` | ⚠️ Partial | Yes | — |
| Referrals | `/app/referrals` | ✅ Working | Yes | — |
| Profile | `/app/profile` | ✅ Working | Yes | — |
| Notifications | `/app/notifications` | ✅ Working | Yes | — |
| Interview Day | `/app/interview-day` | ✅ Working | Yes | — |
| Guide | `/app/guide` | ✅ Working | — | Static |
| Scorecard | `/app/scorecard/:id` | ⚠️ Partial | Yes | Depends on session data |
| Settings (all 14 tabs) | `/app/settings/*` | ✅ Mostly Working | Yes | SettingsData + SettingsDanger use anon key |
| Admin (all 7 pages) | `/app/admin/*` | ✅ Working | Yes | Admin-gated correctly |

---

## 2. BACKEND INTEGRATION — Critical Issues

### 🔴 CRITICAL: Anon Key Used Instead of JWT (10 files)
Edge functions require `auth.uid()` via JWT, but these files send `SUPABASE_ANON_KEY` as the Bearer token, causing **auth failures on RLS-protected operations**:

| File | Edge Function Called |
|---|---|
| `src/pages/app/prep/Rephraser.tsx` | `prep-tool` |
| `src/pages/app/prep/CodingHints.tsx` | `prep-tool` |
| `src/pages/app/prep/SystemDesign.tsx` | `prep-tool` |
| `src/pages/app/prep/ProjectBuilder.tsx` | `prep-tool` |
| `src/pages/app/prep/PrepLab.tsx` (2 calls) | `prep-tool`, `company-research` |
| `src/pages/app/company-research/CompanyProfile.tsx` | `company-research` |
| `src/pages/app/debrief/DebriefDetail.tsx` | `generate-debrief` |
| `src/pages/app/settings/SettingsData.tsx` | `export-user-data` |
| `src/pages/app/settings/SettingsDanger.tsx` (2 calls) | `delete-account`, `export-user-data` |
| `src/pages/onboarding/OnboardingStep5ResumeUpload.tsx` | `parse-resume` |

**Fix**: Replace `SUPABASE_ANON_KEY` with `session.access_token` via `supabase.auth.getSession()` in all 10 files.

### ✅ Files Already Using JWT Correctly
`TestConfigure.tsx`, `TestSession.tsx`, `ExamPapers.tsx`, `TestResults.tsx`, `PrepLab.tsx` (STAR calls), `AdminSeedQuestions.tsx`, `UploadQuestions.tsx`, `useAnalytics.ts`, `useDocuments.ts`

### Missing Edge Functions (called but don't exist)
| Called From | Function Name | Status |
|---|---|---|
| `useGamification.ts` | `award-xp` | **Does not exist** — will 404 |
| `useGamification.ts` | `unlock-badge` | **Does not exist** — will 404 |

### Missing Stripe Secrets
`stripe-webhook/index.ts` requires `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` — neither is in project secrets. Stripe billing is **completely non-functional**.

---

## 3. RESPONSIVE DESIGN AUDIT

### App Shell (`AppShell` in App.tsx)
- ✅ Sidebar hidden on mobile, drawer-based open
- ✅ `MobileNav` bottom tab bar visible `<md` only
- ✅ Main content has `pb-16 md:pb-0` for bottom nav clearance
- ✅ Content area uses responsive padding: `px-3 sm:px-4 md:px-6 lg:px-8`

### Potential Issues (based on code patterns)
| Component | Issue |
|---|---|
| MobileNav | Only 5 tabs — no access to Documents, Settings, Sessions, etc. from bottom bar |
| Live Overlay | Full-screen, no mobile adaptation visible — may be unusable on small screens |
| Test Session | Complex timer + question grid layout — needs testing on 360px |
| Settings tabs | Nested settings routes may not have mobile tab navigation |
| Admin Layout | NavLink-based sidebar — may not collapse on mobile |
| PrepLab | Multiple tool cards — responsive grid likely works but untested |

### Viewport: User is on 360px mobile
Most pages use Tailwind responsive classes (`md:`, `lg:`) which should handle this, but the complex interactive pages (LiveRehearsal, TestSession, Settings) are the highest risk for layout breaks.

---

## 4. DUPLICATE DETECTION

### 🔴 Duplicate Page Sets (top-level vs `/app/` versions)
These files exist at both `src/pages/` AND `src/pages/app/` — only the `/app/` versions are used in routing:

| Top-level (DEAD) | App version (ACTIVE) |
|---|---|
| `src/pages/Dashboard.tsx` (393 lines) | `src/pages/app/Dashboard.tsx` (554 lines) |
| `src/pages/Analytics.tsx` (436 lines) | `src/pages/app/Analytics.tsx` (466 lines) |
| `src/pages/MockSession.tsx` | `src/pages/app/mock/MockSession.tsx` |
| `src/pages/LiveCopilot.tsx` | `src/pages/app/live/LiveRehearsal.tsx` |
| `src/pages/PrepLab.tsx` | `src/pages/app/prep/PrepLab.tsx` |
| `src/pages/DocumentVault.tsx` | `src/pages/app/documents/Documents.tsx` |
| `src/pages/InterviewScheduler.tsx` | `src/pages/app/interviews/Interviews.tsx` |
| `src/pages/Scorecard.tsx` | Used via `/app/scorecard/:id` — only one copy |
| `src/pages/Index.tsx` | **Placeholder** — never rendered (Landing page used for `/`) |

**Impact**: ~2,500 lines of dead code. The top-level `pages/index.ts` barrel exports them all, but no route ever renders them.

### Duplicate Room/Practice Pages
- `src/pages/app/practice/` — PracticeRooms, NewRoom, RoomSession
- `src/pages/app/rooms/` — PracticeRooms, NewRoom, RoomSession

**Both directories exist with different implementations.** Only `rooms/` versions are used in routing. The `practice/` directory is dead code (~600+ lines).

### Duplicate Barrel Exports
`src/pages/app/index.ts` exports rooms content twice under different names:
```
export { PracticeRooms, NewRoom, RoomSession } from "./practice";
export { PracticeRooms as Rooms, NewRoom as CreateRoom, RoomSession as Room } from "./rooms";
```

### Store Duplication
- `src/store/userStore.ts` — Re-exports `useAuthStore` from `authStore.ts` + contains a separate `NotificationSlice` that duplicates `src/store/notificationStore.ts`
- `src/store/index.ts` line: `export { useAuthStore as useUserStore } from "./userStore"` — creates a third alias

---

## 5. DEAD CODE

### Dead Files (~4,000+ lines)
| File | Lines | Why Dead |
|---|---|---|
| `src/pages/Index.tsx` | 16 | Placeholder, never rendered |
| `src/pages/Dashboard.tsx` | 393 | Replaced by `app/Dashboard.tsx` |
| `src/pages/Analytics.tsx` | 436 | Replaced by `app/Analytics.tsx` |
| `src/pages/MockSession.tsx` | ~200 | Replaced by `app/mock/MockSession.tsx` |
| `src/pages/LiveCopilot.tsx` | 136 | Replaced by `app/live/LiveRehearsal.tsx` |
| `src/pages/PrepLab.tsx` | ~300 | Replaced by `app/prep/PrepLab.tsx` |
| `src/pages/DocumentVault.tsx` | ~200 | Replaced by `app/documents/Documents.tsx` |
| `src/pages/InterviewScheduler.tsx` | ~200 | Replaced by `app/interviews/Interviews.tsx` |
| `src/pages/app/practice/*` (3 files) | ~600 | Duplicated by `app/rooms/*` |
| `src/pages/app/live/live_index.ts` | — | Unused barrel (actual barrel is `index.ts`) |

### `@ts-nocheck` Epidemic
**114 files** have `@ts-nocheck` at the top, suppressing ALL TypeScript errors. This hides:
- Incorrect prop types
- Missing null checks
- Wrong import types
- Dead code that would be flagged by unused variable checks

### Unused/Orphan Hooks
| Hook | Issue |
|---|---|
| `useRoom.ts` | May be unused — rooms use direct Supabase queries in page components |
| `useModelSwitcher.ts` | Unclear if referenced |
| `useSafeTabShare.ts` | Unclear if referenced |
| `useSilenceBoundary.ts` | Unclear if referenced |

---

## 6. ARCHITECTURE & CODE QUALITY

### Critical Architectural Issues

**A. Inconsistent Auth Token Pattern**
The codebase uses THREE different patterns for edge function auth:
1. ✅ `supabase.auth.getSession()` → JWT token (correct — ~8 files)
2. 🔴 `SUPABASE_ANON_KEY` hardcoded in Authorization header (broken — ~10 files)
3. ⚠️ `supabase.functions.invoke()` (auto-attaches token — but rarely used)

**B. `@ts-nocheck` on 114 files**
This is the #1 code quality issue. TypeScript checking is essentially disabled across the entire app, meaning bugs are invisible at build time.

**C. Dual Supabase Client Concern**
- `src/lib/supabase/client.ts` — Main client
- `src/integrations/supabase/client.ts` — Auto-generated integration client
Both exist; need to verify they point to the same instance.

**D. Feature Flags Store**
`globalStore.resolveFeatureFlags()` is called during boot but feature flags are not visibly enforced anywhere in routing or UI gating (only `PlanGate` component exists).

**E. Credit Deduction Not Enforced**
`deduct_credits` RPC exists in DB but is only called from `useLiveCopilot.ts` via `creditsManager`. Most features (PrepLab, Mock Test, Company Research) do NOT check or deduct credits before making AI calls.

---

## PRIORITIZED RECOMMENDATIONS

### 🔴 P0 — Critical (Breaks core functionality)
1. **Fix anon key auth in 10 files** — Replace `SUPABASE_ANON_KEY` with session JWT in all edge function calls. This is a copy-paste fix across files.
2. **Add missing Stripe secrets** — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — billing is completely dead without them.
3. **Remove missing edge function calls** — `award-xp` and `unlock-badge` don't exist; wrap in try/catch or remove.

### 🟠 P1 — High (Significant impact)
4. **Delete ~4,000 lines of dead pages** — Remove top-level duplicates and `practice/` directory.
5. **Enforce credit deduction** — Add credit checks before PrepLab, Mock Test, and Company Research AI calls.
6. **Fix PrepLab STAR builder calls** — Two calls in PrepLab.tsx already use JWT, but two others use anon key (inconsistent within same file).

### 🟡 P2 — Medium (Quality/maintainability)
7. **Remove `@ts-nocheck`** from files incrementally — Start with stores and hooks (highest impact).
8. **Consolidate `userStore.ts`** — Move NotificationSlice to `notificationStore.ts`, make `userStore.ts` a pure re-export.
9. **Mobile nav coverage** — Add Settings, Documents, Sessions access to MobileNav or add a "More" tab.
10. **Admin layout mobile** — Add responsive sidebar collapse for admin pages.

### 🟢 P3 — Optional (Nice to have)
11. **Unify edge function auth pattern** — Create a shared `fetchEdge(fnName, body)` utility that always attaches JWT.
12. **Resume extraction preview UI** — Build the split-screen review flow described in Prompt 4.
13. **Clean up barrel exports** — Remove duplicate exports in `pages/index.ts` and `pages/app/index.ts`.

---

## SUMMARY COUNTS

| Category | Count |
|---|---|
| Total pages/routes | 58 |
| Fully working | 32 |
| Partially working (need API keys/data) | 16 |
| Broken (wrong auth token) | 10 |
| Dead/duplicate page files | 11 |
| Files with `@ts-nocheck` | 114 |
| Edge functions deployed | 31 |
| Edge functions missing (called but don't exist) | 2 |
| Missing secrets (Stripe) | 2 |
| Lines of dead code (estimated) | 4,000+ |

