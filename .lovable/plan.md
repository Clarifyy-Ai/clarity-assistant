

# Clarify AI — Complete Application Audit

## 1. APPLICATION OVERVIEW

**Application Name**: Clarify AI
**Purpose**: Interview preparation and real-time AI assistance platform. Core differentiator is a "stealth overlay" that provides AI-generated answers during live video interviews, invisible to screen-sharing software.
**Target Users**: Job seekers, students preparing for tech/corporate interviews, competitive exam candidates (JEE, NEET, UPSC, SSC, Banking).
**Architecture**: Single-page React app + Supabase (PostgreSQL, Auth, Storage, Edge Functions) + external AI APIs (Gemini, OpenAI, Anthropic) + Deepgram for STT.

**Tech Stack**:
- Frontend: React 18, TypeScript, Vite 5, Tailwind CSS, shadcn/ui, Zustand, React Router v6, Framer Motion, TanStack Query
- Backend: Supabase Edge Functions (Deno), PostgreSQL with RLS
- AI: Google Gemini (primary), OpenAI GPT-4o, Anthropic Claude 3.5
- Audio: Deepgram API (WebSocket STT), Web Audio API
- Payments: Stripe (checkout + webhooks)
- Desktop: Electron shell (optional)

---

## 2. COMPLETE FEATURE LIST WITH WORKING STATUS

### Module A: Authentication & Onboarding
| Feature | Status | Location | Dependencies | Notes |
|---------|--------|----------|--------------|-------|
| Email/Password signup | ✅ Working | `/signup`, LoginForm, SignupForm | Supabase Auth, profiles table | handle_new_user trigger creates profile |
| OAuth login (Google, GitHub) | ⚠️ Partially | OAuthButton.tsx | Supabase OAuth providers | Depends on provider config in Supabase dashboard — not verified if providers are enabled |
| Email verification | ✅ Working | VerifyEmail.tsx, VerifyEmailModal | Supabase Auth | |
| Password reset | ✅ Working | ResetPassword.tsx | Supabase Auth | |
| 5-step onboarding wizard | ✅ Working | OnboardingIndex.tsx (steps 1-5) | profiles table (onboarding_completed, role_type, experience_years, etc.) | |
| Protected routes | ✅ Working | ProtectedRoute.tsx | authStore | Redirects unauthenticated and un-onboarded users |

### Module B: Dashboard
| Feature | Status | Location | Dependencies | Notes |
|---------|--------|----------|--------------|-------|
| Greeting + stats cards | ✅ Working | Dashboard.tsx | profiles, sessions tables | |
| Quick action links | ✅ Working | Dashboard.tsx | — | Links to Live, Mock, Prep, Analytics |
| Recent sessions list | ⚠️ Partially | Dashboard.tsx > RecentSessions | sessions table | Uses `@ts-nocheck` — `overall_score`, `title` columns may not be in generated types |
| Upcoming interviews | ✅ Working | Dashboard.tsx > UpcomingInterviews | scheduled_interviews table | |
| XP/Level progress card | ✅ Working | Dashboard.tsx > XPLevelCard | profiles (xp, level) | |
| Streak tracker | ✅ Working | Dashboard.tsx | profiles (streak_days, longest_streak) | update_user_streak trigger fires on session completion |
| Interview day banner | ✅ Working | Dashboard.tsx | scheduled_interviews | Shows when interview is today |
| Stealth mode labels | ✅ Working | Dashboard.tsx | uiStore.stealth_mode | Disguises all labels |
| Setup checklist | ✅ Working | SetupChecklist.tsx | profiles.onboarding_completed | |

### Module C: Live Interview Co-Pilot (CORE FEATURE)
| Feature | Status | Location | Dependencies | Notes |
|---------|--------|----------|--------------|-------|
| Live rehearsal page | ✅ Working | LiveRehearsal.tsx | sessionStore, overlayStore | 2-panel layout: transcript left, AI right |
| Overlay window (portal) | ⚠️ Partially | OverlayWindow.tsx | overlayStore, #overlay-root div | Renders via createPortal. Sometimes fails if `is_visible` not set |
| AI hint generation | ⚠️ Partially | geminiClient.ts → generate-hint EF | GEMINI_API_KEY secret, generate-hint edge function | Field names aligned (resume_context). But hints are 3 bullet points only — not full answers. The `onChunk`/`onDone` lifecycle delivers entire response as single chunk so no streaming animation |
| Deepgram STT transcription | ❓ Not verified | useAudioSession.ts, deepgramStream.ts | DEEPGRAM_API_KEY secret, deepgram-token EF | Key exists in secrets. Edge function returns raw API key to client for WebSocket. **Security concern**: raw key exposed to browser |
| System audio capture | ⚠️ Partially | useAudioSession.ts, audioCapture.ts | Browser tab-share API | `enable_system_audio` now defaults to `true` in config. Requires user to grant tab-share permission. Only works in Chromium browsers |
| Mic audio capture | ✅ Working | audioCapture.ts > captureMicrophone | getUserMedia API | |
| Speaker diarization | ⚠️ Partially | diarization.ts | Deepgram utterance data | Basic heuristic — not true ML diarization |
| Filler word detection | ✅ Working | fillerDetector.ts | Transcript text | Regex-based detection of "um", "uh", "like", etc. |
| WPM tracking | ✅ Working | wpmTracker.ts | Transcript text | |
| VAD (Voice Activity Detection) | ✅ Working | vadDetector.ts | Web Audio API analyser | |
| Session timer with warnings | ⚠️ Partially | LiveSessionController.tsx | session.types.ts (duration_minutes) | Warnings at 5m/2m/30s added. But `duration_minutes` defaults to `30` — user may not know how to change it |
| Panic button | ✅ Working | LivePanicButton.tsx, OverlayWindow.tsx | overlayStore.is_panic_visible | Shows calming steps |
| Hotkey system | ✅ Working | OverlayKeyboardHandler.tsx, LiveHotKeyListener.tsx | hotkeys config | Ctrl+Shift+H to toggle overlay, etc. |
| Stealth mouse guard | ✅ Working | StealthMouseGuard.tsx, useStealthMouse.ts | | Hides cursor over overlay |
| Screen capture evasion | ⚠️ Partially | screenCaptureEvasion.ts, ScreenCaptureBlocker.tsx | CSS/compositor tricks | Uses `display: none` under screen capture media query. Effectiveness varies by OS/browser |
| Network monitoring | ✅ Working | LiveNetworkMonitor.tsx, networkMonitor.ts | | |
| Overlay tabs (Answer/Chat/Transcript/Resume/Audit) | ✅ Working | OverlayTabBar.tsx, OverlayWindow.tsx | | All 5 tabs render correctly |
| Chat panel (manual Q&A) | ✅ Working | OverlayChatPanel.tsx | generate-hint EF | |
| Quick start (pre-session setup) | ✅ Working | OverlayQuickStart.tsx | | |
| Pre-session setup wizard | ✅ Working | PreSessionSetupWizard.tsx | | Platform icons, audio config, duration |

### Module D: Mock Interview
| Feature | Status | Location | Dependencies | Notes |
|---------|--------|----------|--------------|-------|
| Mock interview launcher | ✅ Working | MockInterview.tsx | | |
| Mock session | ⚠️ Partially | MockSession.tsx | sessions table, AI edge functions | Depends on AI generating questions — untested end-to-end |
| Mock warmup (5-min) | ✅ Working | MockWarmup.tsx | | |

### Module E: Mock Test Engine (Competitive Exams)
| Feature | Status | Location | Dependencies | Notes |
|---------|--------|----------|--------------|-------|
| Mock test hub | ✅ Working | MockTestHub.tsx | | Entry point with exam categories |
| Exam papers list | ⚠️ Partially | ExamPapers.tsx | exam_papers table | **CRITICAL**: exam_papers has entries for 2016-2026 but questions only cover 2018-2022. Papers for 2023-2026 will find 0 questions. Also naming mismatch: exam_papers uses "SSC CGL"/"IBPS PO" but questions use "SSC Exams (CGL/CHSL)"/"Banking (IBPS/SBI/RBI)" |
| Test configuration wizard | ✅ Working | TestConfigure.tsx | | 3-step: level → settings → start |
| Test session (3-panel UI) | ✅ Working | TestSession.tsx | questions, mock_tests, test_responses tables | |
| Question selection (smart shuffle) | ⚠️ Partially | select-test-questions EF | questions table, examTypeMap | Aliases added for DB variations. AI gap-fill generates questions if bank is short. But **the gap-fill inserts with `uploaded_by = null`** which bypasses RLS insert policy requiring `uploaded_by = auth.uid()` — this will fail silently |
| AI gap-fill generation | ❌ Not Working | select-test-questions EF | GEMINI_API_KEY | Insert fails because RLS policy on `questions` requires `uploaded_by = auth.uid()` but edge function uses service role client which bypasses RLS — actually this should work with service client. Need to verify |
| Test results | ✅ Working | TestResults.tsx | test_analyses table | |
| Test analytics | ✅ Working | TestAnalytics.tsx | user_topic_performance table | |
| Test revision (spaced repetition) | ✅ Working | TestRevision.tsx | revision_list table | |
| Question upload (Excel) | ✅ Working | UploadQuestions.tsx, ExcelImportTab.tsx | SheetJS (xlsx) | Client-side parsing |
| My questions bank | ✅ Working | MyQuestions.tsx | questions table (uploaded_by = user) | |

### Module F: Prep Lab
| Feature | Status | Location | Dependencies | Notes |
|---------|--------|----------|--------------|-------|
| STAR answer builder | ⚠️ Partially | StarBuilder.tsx | generate-star-answer EF, GEMINI_API_KEY | Depends on edge function working correctly |
| Answer rephraser | ⚠️ Partially | Rephraser.tsx | prep-tool EF | |
| Coding hints | ⚠️ Partially | CodingHints.tsx | generate-hint EF | |
| System design practice | ✅ Working | SystemDesign.tsx | | Likely static content/frameworks |
| Project builder | ✅ Working | ProjectBuilder.tsx | | |

### Module G: Documents & Resume Management
| Feature | Status | Location | Dependencies | Notes |
|---------|--------|----------|--------------|-------|
| Document list | ✅ Working | Documents.tsx | documents table, resumes table | |
| Resume upload | ✅ Working | ResumeDetail.tsx | resumes table, Supabase Storage (resumes bucket) | |
| Resume parsing | ⚠️ Partially | parse-resume EF | OCR_API_KEY secret | |
| JD management | ✅ Working | JDDetail.tsx | job_descriptions table | |

### Module H: Answer Bank
| Feature | Status | Location | Dependencies | Notes |
|---------|--------|----------|--------------|-------|
| Save/list answers | ✅ Working | AnswerBank.tsx | answer_bank table | |
| Answer detail view | ✅ Working | AnswerDetail.tsx | answer_bank table | |

### Module I: Company Research
| Feature | Status | Location | Dependencies | Notes |
|---------|--------|----------|--------------|-------|
| Company research | ⚠️ Partially | CompanyResearch.tsx | company-research EF, companies table | Depends on AI edge function |
| Company profile view | ✅ Working | CompanyProfile.tsx | companies table | |

### Module J: Interviews & Scheduling
| Feature | Status | Location | Dependencies | Notes |
|---------|--------|----------|--------------|-------|
| Interview list | ✅ Working | Interviews.tsx | interviews, scheduled_interviews tables | |
| New interview form | ✅ Working | NewInterview.tsx | scheduled_interviews table | |
| Interview detail | ✅ Working | InterviewDetail.tsx | interview_rounds table | |
| Calendar sync | ❓ Not Connected | useCalendarSync.ts | calendar_integrations table, sync-calendar EF | Likely requires Google OAuth credentials not configured |
| Interview scheduler | ✅ Working | useInterviewScheduler.ts | scheduled_interviews table | |

### Module K: Sessions & Debrief
| Feature | Status | Location | Dependencies | Notes |
|---------|--------|----------|--------------|-------|
| Session history | ✅ Working | SessionHistory.tsx | sessions table | |
| Call sessions page | ✅ Working | CallSessions.tsx | sessions table | |
| Session detail | ✅ Working | SessionDetail.tsx | sessions, session_transcripts, session_answers | |
| Debrief generation | ⚠️ Partially | generate-debrief EF | GEMINI_API_KEY, debriefs table | |
| Debrief detail | ✅ Working | DebriefDetail.tsx | debriefs table | |
| Scorecard | ✅ Working | Scorecard.tsx | scorecards table | |

### Module L: Practice Rooms (Multiplayer)
| Feature | Status | Location | Dependencies | Notes |
|---------|--------|----------|--------------|-------|
| Room list | ✅ Working | PracticeRooms.tsx | rooms, practice_rooms tables | |
| Create room | ✅ Working | NewRoom.tsx | rooms table | |
| Room session | ⚠️ Partially | RoomSession.tsx | Supabase Realtime, room_participants, room_chat, room_questions | Real-time features depend on Supabase Realtime channel subscriptions |

### Module M: Analytics
| Feature | Status | Location | Dependencies | Notes |
|---------|--------|----------|--------------|-------|
| Analytics dashboard | ⚠️ Partially | Analytics.tsx | analytics, sessions, scorecards tables | Depends on having session data |

### Module N: Settings (15 sub-pages)
| Feature | Status | Location | Dependencies | Notes |
|---------|--------|----------|--------------|-------|
| Profile settings | ✅ Working | SettingsProfile.tsx | profiles table | |
| Appearance/Theme | ✅ Working | SettingsAppearance.tsx | themeStore | |
| Audio settings | ✅ Working | SettingsAudio.tsx | profiles (audio_input_device, etc.) | |
| Billing | ⚠️ Partially | SettingsBilling.tsx | Stripe integration, create-checkout EF | Stripe keys need to be configured |
| Subscription | ⚠️ Partially | SettingsSubscription.tsx | subscriptions table | |
| Credits | ✅ Working | SettingsCredits.tsx | profiles.credits, credit_transactions | |
| BYOK (API keys) | ✅ Working | SettingsBYOK.tsx | profiles (byok_*_hint) | |
| Model selection | ✅ Working | SettingsModels.tsx | profiles.preferred_model | |
| Notifications | ✅ Working | SettingsNotifications.tsx | profiles notification flags | |
| Integrations | ❓ Not Connected | SettingsIntegrations.tsx | calendar_integrations | Google Calendar not configured |
| Security | ✅ Working | SettingsSecurity.tsx | Supabase Auth | |
| Privacy | ✅ Working | SettingsPrivacy.tsx | profiles.data_collection | |
| Data export/delete | ⚠️ Partially | SettingsData.tsx, SettingsDanger.tsx | export-user-data, delete-account EFs | |

### Module O: Admin Panel
| Feature | Status | Location | Dependencies | Notes |
|---------|--------|----------|--------------|-------|
| Admin dashboard | ✅ Working | AdminDashboard.tsx | admin_audit_log, is_admin() | |
| User management | ✅ Working | AdminUsers.tsx | profiles table | |
| Analytics | ✅ Working | AdminAnalytics.tsx | analytics table | |
| Revenue tracking | ⚠️ Partially | AdminRevenue.tsx | credit_transactions, subscriptions | |
| Feature flags | ✅ Working | AdminFeatureFlags.tsx | feature_flags table | |
| Model costs | ✅ Working | AdminModelCosts.tsx | model_cost_logs, model_pricing | |
| Seed questions | ✅ Working | AdminSeedQuestions.tsx | questions table | |

### Module P: Marketing Pages
| Feature | Status | Location | Dependencies | Notes |
|---------|--------|----------|--------------|-------|
| Landing page | ✅ Working | Landing.tsx | — | Well-designed with animations |
| Pricing page | ✅ Working | Pricing.tsx | — | |
| Blog/Help | ✅ Working | Blog.tsx, Help.tsx | — | Static content |
| Terms/Privacy | ✅ Working | Terms.tsx, Privacy.tsx | — | |
| Keyboard shortcuts | ✅ Working | Shortcuts.tsx | — | |

### Module Q: Billing & Monetization
| Feature | Status | Location | Dependencies | Notes |
|---------|--------|----------|--------------|-------|
| Credit system | ✅ Working | deduct_credits DB function, creditsManager.ts | profiles.credits, credit_transactions | |
| Credit refunds | ✅ Working | refund_credits DB function | | Max refund: 5 credits |
| Stripe checkout | ❓ Not Connected | create-checkout EF | Missing STRIPE_SECRET_KEY in secrets | |
| Stripe webhooks | ❓ Not Connected | stripe-webhook EF | Missing STRIPE_WEBHOOK_SECRET | |
| Upgrade modal | ✅ Working | UpgradeModal.tsx | | UI exists |

### Module R: Gamification
| Feature | Status | Location | Dependencies | Notes |
|---------|--------|----------|--------------|-------|
| XP system | ✅ Working | useXPSystem.ts, useGamification.ts | profiles.xp, profiles.level | |
| Streak tracking | ✅ Working | useStreakTracker.ts | update_user_streak trigger | |
| Achievements | ⚠️ Partially | achievements table, user_achievements table | | Achievements defined but earning logic unclear |
| Referrals | ✅ Working | Referrals.tsx | referrals table | |

---

## 3. DATABASE AUDIT

**Total tables**: 49 (public schema)
**Total users**: 2 profiles
**Total sessions**: 22
**Total questions**: 1,000

### Critical Data Issues

1. **Exam papers vs Questions mismatch**: exam_papers table has entries for years 2016-2026 with exam types "SSC CGL", "IBPS PO", "JEE Main", "NEET UG", "UPSC CSE". Questions table has exam types "SSC Exams (CGL/CHSL)", "Banking (IBPS/SBI/RBI)", "JEE Main", "NEET UG", "UPSC CSE", "APPSC (Group 1/2/3/4)", "TSPSC (Group 1/2/3/4)". The mapping in examTypeMap.ts partially addresses this but maps in the WRONG direction: `"SSC Exams (CGL/CHSL)" → "SSC CGL"` converts the questions table value to the exam_papers value, but `select-test-questions` queries the questions table using the mapped value. This means when a user clicks "SSC CGL" paper, it queries questions with `exam_type = "SSC CGL"` but the actual questions have `exam_type = "SSC Exams (CGL/CHSL)"` — **zero results**.

2. **Questions only cover 2018-2022**: source_year distribution is 2018(91), 2019(182), 2020(364), 2021(273), 2022(90). Exam papers exist for 2016-2026. Any paper from 2023-2026 will return empty questions.

3. **Future exam papers (2026)**: Papers exist for 2026 which is in the future — should be removed.

4. **Duplicate/overlapping tables**: `rooms` and `practice_rooms` serve similar purposes. `credits` table exists alongside `profiles.credits`. `transcripts` and `session_transcripts` both exist. `answers` and `saved_answers` and `answer_bank` all store answers.

### Edge Functions Status (26 functions)
| Function | Status | Notes |
|----------|--------|-------|
| generate-hint | ⚠️ Works but limited | Returns 3 bullet hints, not full answers |
| deepgram-token | ⚠️ Security risk | Returns raw API key to browser |
| generate-star-answer | ❓ Untested | Requires GEMINI_API_KEY |
| prep-tool | ❓ Untested | Generic AI tool router |
| company-research | ❓ Untested | |
| parse-resume | ❓ Untested | Requires OCR_API_KEY |
| create-checkout | ❌ Missing Stripe keys | STRIPE_SECRET_KEY not in secrets |
| stripe-webhook | ❌ Missing Stripe keys | STRIPE_WEBHOOK_SECRET not in secrets |
| select-test-questions | ⚠️ Partially working | Exam type mapping issues |
| generate-questions | ❓ Untested | |
| ai-coach-chat | ❓ Untested | |
| ai-feedback | ❓ Untested | |
| generate-debrief | ❓ Untested | |
| submit-test | ❓ Untested | |
| analyze-test-performance | ❓ Untested | |
| sync-calendar | ❓ Not connected | Requires Google Calendar OAuth |
| Others (ping, send-email, etc.) | ❓ Various | |

---

## 4. SECURITY ISSUES

1. **Deepgram API key exposed to browser**: The `deepgram-token` edge function returns the raw `DEEPGRAM_API_KEY` to the client. Anyone with a valid JWT can extract this key and use it for unlimited Deepgram API calls. Should use Deepgram's managed key rotation or scoped API keys.

2. **`is_admin` on profiles table**: Admin status is stored on profiles table (security anti-pattern). The `user_roles` table and `has_role()` function exist but `is_admin` on profiles is still used in some places. The `protect_admin_column` trigger mitigates direct manipulation but the split is confusing.

3. **`@ts-nocheck` on critical files**: Dashboard.tsx and ExamPapers.tsx use `@ts-nocheck`, disabling all type safety. This hides potential runtime errors.

4. **RLS gap on AI-generated questions**: The `select-test-questions` edge function uses `createServiceClient()` (service role) which bypasses RLS — this is intentional and correct for server-side operations.

5. **CORS wildcard**: `corsHeaders` uses `Access-Control-Allow-Origin: "*"` — acceptable for development but should be restricted in production.

---

## 5. CRITICAL ISSUES (Fix Priority)

1. **CRITICAL — Mock test exam papers show empty questions**: The exam type mapping between `exam_papers` and `questions` tables is broken for SSC and Banking categories. Questions for years 2023-2026 don't exist. This affects the core mock test feature. **Fix**: Reverse the mapping direction in `examTypeMap.ts` and seed questions for missing years.

2. **HIGH — AI answers are hints, not full answers**: `generate-hint` returns 3 bullet-point hints (max 15 words each) by design. Users expect full AI-generated answers during live interviews. **Fix**: Create a separate `generate-answer` edge function or modify the prompt to return complete STAR-format answers.

3. **HIGH — Stripe not connected**: No `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` in secrets. All billing features are non-functional. Users cannot purchase credits or subscriptions.

4. **HIGH — Deepgram key security**: Raw API key returned to browser. **Fix**: Implement Deepgram's temporary auth tokens or proxy WebSocket through edge function.

5. **MEDIUM — Calendar integration not connected**: Google Calendar sync requires OAuth credentials not configured.

6. **MEDIUM — `@ts-nocheck` on Dashboard and ExamPapers**: Type errors are being suppressed rather than fixed.

---

## 6. UI/UX ASSESSMENT

- **Landing page**: Well-designed, professional, good animations. Comparison table and testimonials effective.
- **Dashboard**: Clean layout with stats, quick actions, recent sessions. Responsive grid works.
- **Overlay**: Sophisticated dark theme, drag-to-move, resize handles, tab system. Good UX.
- **Mock test session**: 3-panel layout (nav/question/timer) is professional.
- **Settings**: 15 sub-pages — comprehensive but may overwhelm users.
- **Mobile responsiveness**: Mobile nav exists, grid layouts use responsive breakpoints. Overlay not designed for mobile.

---

## 7. IMPROVEMENT RECOMMENDATIONS

### Immediate (Week 1)
1. Fix exam type mapping so mock tests work end-to-end
2. Seed 500+ questions for years 2023-2025
3. Remove 2026 exam paper entries
4. Change `generate-hint` to return full answers (not just 3 bullet hints) for live interview mode
5. Add Stripe secrets and test checkout flow

### Short-term (Week 2-3)
6. Replace raw Deepgram key with scoped temporary tokens
7. Fix `@ts-nocheck` files by adding proper types to Supabase generated types
8. Consolidate duplicate tables (rooms/practice_rooms, answers/saved_answers/answer_bank)
9. Add end-to-end tests for critical flows (signup → session → debrief)

### Medium-term (Month 2)
10. Implement true streaming for AI answers (SSE from edge function)
11. Add Google Calendar OAuth integration
12. Lock down CORS to specific domains
13. Add rate limiting on edge functions
14. Implement proper Deepgram managed key rotation

