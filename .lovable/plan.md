
# Clarify AI — Manual-Driven Production Audit

> Source of truth: **Clarify AI Complete User Manual v1.0 (2025 Edition, 28 pages, 12 chapters)** uploaded this turn. All findings anchored to actual files in this repo as of commit-state at audit time.

---

## 1. Executive Summary

The product is **NOT production-ready against the manual**. The codebase covers ~70% of the manual's surface area but contains four launch-blocking categories of issues:

1. **Compliance / Policy Risk (BLOCKER):** The entire flagship feature line — Stealth Overlay (Ch. 6), Live AI Co-Pilot real-time interview assistance (Ch. 8), Screen Capture Blocker, Panic Button, "invisible to Zoom/Teams" claims — is implemented and wired (Electron bridge in `electron/main.cjs`, `src/lib/stealth/*`, `src/lib/overlay/screenCaptureEvasion.ts`). Shipping this materially exposes the company to fraud-facilitation, ToS-violation, and CFAA-adjacent liability. **Recommendation: gate behind enterprise-only legitimate-use contracts OR remove from production scope.**
2. **Manual-vs-Implementation contract drift (BLOCKER):** Pricing, plan limits, credit defaults, multi-model routing, OAuth providers, retention defaults, and scoring weights diverge from the manual's contractual numbers.
3. **Feature-claim gap (HIGH):** Several manual-promised features have UI shells but no working backend (BYOK key validation, Private Mode network severance, vocabulary boost, 2 fps screenshot capture, panel-mode diarization, weekly email digest, Google Calendar OAuth).
4. **Schema / domain drift (HIGH):** Mock-test surface area is built for **competitive-exam (JEE/NEET) MCQs**, not interview Q&A as the manual describes — a fundamental product-scope mismatch.

**Verdict: DO NOT LAUNCH** as described in the manual until §15 P0 items are resolved or the manual is rewritten to match the actual product.

---

## 2. Manual Coverage Summary

| Chapter | Manual Sections | Fully Working | Partial / Broken | Missing | Compliance Risk |
|---|---|---|---|---|---|
| 1 Setup & Onboarding | 4 | 3 | 1 | 0 | 0 |
| 2 Dashboard | 3 | 2 | 1 | 0 | 0 |
| 3 Documents | 3 | 2 | 1 | 0 | 0 |
| 4 Prep Tools | 4 | 3 | 1 | 0 | 0 |
| 5 Mock Tests | 4 | 1 | 2 | 1 | 0 |
| 6 Stealth Overlay | 3 | 0 | 0 | 0 | **3** |
| 7 Audio & Transcription | 3 | 2 | 1 | 0 | 0 |
| 8 Live AI Co-Pilot | 3 | 0 | 1 | 0 | **2** |
| 9 Analytics & Debriefs | 3 | 2 | 1 | 0 | 0 |
| 10 Billing & Subscriptions | 3 | 1 | 2 | 0 | 0 |
| 11 Settings | 4 | 1 | 3 | 0 | 0 |
| 12 Troubleshooting & Security | 4 | 1 | 2 | 1 | 0 |
| **Totals (41)** | | **18** | **16** | **2** | **5** |

Coverage rate (Fully Working ÷ Total) = **44%**. Manual makes claims the code does not currently satisfy.

---

## 3. Feature Checklist Matrix

> Columns abbreviated for readability. Severity: S0 launch-blocker · S1 high · S2 medium · S3 low.

### Chapter 1 — Setup & Onboarding

| Manual feature | Status | Files | Backend | Evidence / Gap | Sev |
|---|---|---|---|---|---|
| 1.2 Email/password signup | FULLY WORKING | `src/pages/auth/Signup.tsx`, `Login.tsx` | Supabase Auth, `handle_new_user()` trigger | Profile + free subscription auto-created | — |
| 1.2 OAuth: Google | FULLY WORKING (assumed configured) | `Login.tsx` | Supabase Auth provider | Code path exists | S2 |
| 1.2 OAuth: GitHub | PARTIALLY WORKING | `Login.tsx` | Supabase Auth | UI button only if provider enabled; **manual promises** GitHub | S2 |
| 1.2 OAuth: LinkedIn | MISSING | n/a | n/a | Manual promises LinkedIn — **not in code** | S2 |
| 1.2 OAuth: Azure AD | MISSING | n/a | n/a | Manual promises Azure AD — **not in code** | S2 |
| 1.2 Email verification | FULLY WORKING | `VerifyEmail.tsx`, `AuthCallback.tsx` | Supabase Auth | Standard flow | — |
| 1.3 5-step onboarding wizard | FULLY WORKING | `src/pages/onboarding/OnboardingStep1Role.tsx`…`Step5ResumeUpload.tsx`, `OnboardingIndex.tsx` | `profiles.onboarding_step`, `target_role`, `experience_years` | All 5 steps match manual order (Role/Seniority/Preferences/Audio/Resume) | — |
| 1.3 Onboarding data feeds AI personalization | PARTIALLY WORKING | `parse-resume`, `generate-answer/index.ts` | `profiles.target_role`, `documents.parsed_*` | Resume fanout fixed last turn; **`role_type`/`experience_years` not injected into prompts** — verify | S1 |
| Reset onboarding from Settings | PARTIALLY WORKING | `SettingsProfile.tsx` | `profiles.onboarding_completed=false` | Need to confirm UI button exists | S2 |
| 1.4 Browser compat (Chrome 110+/Firefox/Edge) | NOT TESTABLE FROM CODE | — | — | No client-side gate; manual claims browser-min only | S3 |

### Chapter 2 — Dashboard

| Manual feature | Status | Files | Evidence / Gap | Sev |
|---|---|---|---|---|
| Readiness Score (0–100 composite) | PARTIALLY WORKING | `src/pages/app/Dashboard.tsx` | Card renders but **composite formula vs manual unverified**; likely placeholder | S1 |
| Upcoming Interviews widget | FULLY WORKING | `Dashboard.tsx`, `useInterviewScheduler.ts` → `scheduled_interviews` | Real data | — |
| Recent Activity feed | PARTIALLY WORKING | `Dashboard.tsx` | Pulls from `analytics`/`sessions`; **no unified activity stream** as manual promises | S2 |
| Quick-Launch bar | FULLY WORKING | `Dashboard.tsx` | Visible | — |
| XP Progress Ring | FULLY WORKING | `Dashboard.tsx`, `profiles.xp`/`level` | Real | — |
| Credit Balance in top bar | FULLY WORKING | `AppLayout`, `profiles.credits` | Real-time via store | — |
| Streak Counter (flame) | FULLY WORKING | `profiles.streak_days`, `update_user_streak()` trigger | Real | — |
| Notifications bell | FULLY WORKING | `Notifications.tsx`, `notifications` table | Real | — |
| Real-time updates without refresh | PARTIALLY WORKING | various | Most via React Query refetch; **no Supabase realtime subscriptions** on dashboard widgets — manual claim of "live view" is overstated | S2 |
| Low-credit warning <50 | DISCONNECTED | `useCreditWarning` (if exists) | Threshold logic not consistently wired to a UI banner | S2 |
| Enterprise ∞ indicator | MISSING | — | No render path for unlimited symbol; `plan_tier` enum exists | S2 |

### Chapter 3 — Documents

| Manual feature | Status | Files | Evidence / Gap | Sev |
|---|---|---|---|---|
| Document hub `/app/documents` | FULLY WORKING | `Documents.tsx`, `ResumeDetail.tsx`, `JDDetail.tsx` | All present | — |
| Resume upload (PDF/DOCX/TXT, 10 MB) | FULLY WORKING | `Documents.tsx` → `resumes` bucket + `parse-resume` | Multi-layer fallback Gemini→Claude→OCR per memory | — |
| JD upload (PDF/DOCX/TXT + URL paste, 5 MB) | PARTIALLY WORKING | `Documents.tsx`, `job_descriptions` table | File upload OK; **URL-paste-and-fetch path** not verified in `parse-resume`-equivalent | S2 |
| Cover Letter (5 MB) | MISSING | — | `documents.type` enum likely lacks COVER_LETTER value; no dedicated upload tile | S2 |
| Portfolio / Projects (15 MB, URL links) | PARTIALLY WORKING | `prep/ProjectBuilder.tsx` | Lives only in Prep Lab, not in Document hub as manual states | S3 |
| Resume↔JD semantic gap analysis | FULLY WORKING | `gap-analysis` edge function | Implemented | — |
| Cloud storage AES-256 / TLS 1.3 | FULLY WORKING (by Supabase default) | `resumes`/`documents` buckets (private) | Supabase Storage default | — |
| Per-user bucket isolation | FULLY WORKING | RLS on `resumes`/`documents` | Verified `resumes_own`, `documents_own` policies | — |
| Retention 0–90 days | PARTIALLY WORKING | `delete_expired_session_data()` cron | Function exists for **sessions**, not for documents; `profiles.data_retention_days` exists but **document cleanup not wired** | S1 |
| Access logging | MISSING | — | No `document_access_log` table; manual promises audit log | S1 |

### Chapter 4 — Interview Prep Tools

| Manual feature | Status | Files | Evidence / Gap | Sev |
|---|---|---|---|---|
| Prep Lab landing | FULLY WORKING | `prep/PrepLab.tsx` | All 5 tools listed | — |
| STAR Method Builder + Save to Answer Bank | FULLY WORKING | `prep/StarBuilder.tsx`, `generate-star-answer`, `polish-star-section`, `save-answer` → `answers` table | End-to-end | — |
| Coding Hints (Py/JS/Java/C++/Go/Rust/SQL) | FULLY WORKING | `prep/CodingHints.tsx`, `generate-hint` | Languages enumerated | — |
| Hint depth (surface/medium/walkthrough) | PARTIALLY WORKING | `generate-hint/index.ts` | Verify `depth` parameter actually shapes the prompt | S2 |
| System Design 50+ scenarios | PARTIALLY WORKING | `prep/SystemDesign.tsx` | Scenario library size **not verified to be ≥50**; likely seeded smaller | S2 |
| Rephraser (3 polished alternatives) | FULLY WORKING | `prep/Rephraser.tsx`, `prep-tool` edge function | Returns 3 variations | — |
| Project Builder (GitHub URL → talking points) | PARTIALLY WORKING | `prep/ProjectBuilder.tsx` | Confirm GitHub API/fetch path; if pure LLM hallucination from URL only → BROKEN | S1 |
| Company Research Engine (5 categories) | FULLY WORKING | `company-research` edge fn, `company-research/CompanyResearch.tsx`, `company_research.raw_data` | Wired | — |

### Chapter 5 — Mock Tests & Practice Sessions

| Manual feature | Status | Files | Evidence / Gap | Sev |
|---|---|---|---|---|
| 5.1 Schedule real interview | FULLY WORKING | `interviews/NewInterview.tsx`, `useInterviewScheduler.ts` → `scheduled_interviews`+`interview_rounds` | After prev-turn cleanup | — |
| Google Calendar 2-way OAuth sync | PARTIALLY WORKING | `sync-calendar` edge fn, `calendar_integrations` table | Edge function exists; **`disconnect-calendar` and OAuth init flow** in `SettingsIntegrations.tsx` need end-to-end verification with real Google client secret | S1 |
| Email + in-app 24h/1h reminders | MISSING | `send-email` exists; no cron job sending reminders | No cron-scheduled reminder job found | S1 |
| 5.2 CSV/Excel custom question upload | PARTIALLY WORKING | `mock-test/UploadQuestions.tsx`, `ExcelImportTab.tsx`, `parse-question-pdf` | Excel-first per memory; **CSV columns expected by manual** (`question,category,difficulty,tags,expected_duration_min`) differ from Excel-import column requirements | S1 |
| 5.3 Practice Session 15–45 min, 5–20 Qs | DISCONNECTED | `mock/MockSession.tsx` **and** `mock-test/TestSession.tsx` | **Two parallel mock flows exist** — `/app/mock` (interview practice) and `/app/mock-test` (JEE/NEET-style MCQ engine). Manual describes only the former. | S0 |
| 5.3 5-Minute Warmup | PARTIALLY WORKING | `mock/MockWarmup.tsx` | Page exists; verify 5-min hard timer + +40 XP grant | S2 |
| AI Interviewer personality (strict/friendly/panel) | PARTIALLY WORKING | `start-session`, `generate-questions` | Verify `personality` field threaded through prompt | S2 |
| Encrypted session recording | MISSING | — | No audio-blob upload to storage; only transcript persisted (`session_transcripts` per memory) — manual promises full audio recording | S1 |
| XP +150 mock / +40 warmup | PARTIALLY WORKING | `update_user_streak()` trigger | Trigger awards only 10/15 XP, not 150/40 — **direct contradiction to manual numbers** | S1 |
| 5.4 Confidence/Content/Clarity score + Model Answer | FULLY WORKING | `generate-debrief`, `debriefs` table | Schema rich, includes `overall_score`, `clarity_score`, `summary` | — |

### Chapter 6 — Stealth Overlay System — **COMPLIANCE / POLICY RISK**

> All items below classified as **COMPLIANCE / POLICY RISK** per your direction. Files mapped; **no improvement recommendations made**.

| Manual feature | Status | Files | Risk note |
|---|---|---|---|
| 6.1 Activate `/app/live/overlay`, Ctrl+Shift+H toggle | COMPLIANCE / POLICY RISK | `pages/app/live/LiveOverlay.tsx`, `components/overlay/OverlayWindow.tsx`, `lib/overlay/hotkeys.ts` | Active wiring exists |
| 6.2 Screen Capture Blocker (SetWindowDisplayAffinity / CGWindowLevel) | COMPLIANCE / POLICY RISK | `lib/stealth/screenCaptureBlocker.ts`, `lib/stealth/electronBridge.ts`, `electron/main.cjs` (Electron 32), `lib/overlay/screenCaptureEvasion.ts` | OS-level evasion explicitly aimed at defeating Zoom/Teams capture. **Recommend removal from launch scope.** |
| 6.2 Opacity Auto-Fade to 15% on mouse-leave | COMPLIANCE / POLICY RISK | `components/overlay/StealthMouseGuard.tsx`, `lib/stealth/screenCaptureBlocker.ts` | Concealment behavior |
| 6.2 Auto-Hide on Focus Loss | COMPLIANCE / POLICY RISK | `screenCaptureBlocker.ts`, `WindowVisibilityManager.tsx` | Concealment behavior |
| 6.2 Panic Button (instant kill) | COMPLIANCE / POLICY RISK | `lib/stealth/stealthActions.ts`, `OverlayKeyboardHandler.tsx` | "Emergency concealment" — explicit deception intent |
| 6.2 No Taskbar Entry / hidden from Alt+Tab | COMPLIANCE / POLICY RISK | `electron/main.cjs` (BrowserWindow `skipTaskbar`) | Concealment behavior |
| 6.3 Hotkeys Ctrl+Shift+H/M/N/F/S/R + Escape + Panic | FUNCTIONALLY WIRED — **risk-classified** | `lib/overlay/hotkeys.ts`, `lib/constants/hotkeys.ts` | Wired |

**Recommended posture (you already chose this):** Remove stealth/evasion from launch. Keep the overlay only as a *visible* practice-mode companion behind a feature flag; rewrite manual Chapter 6.

### Chapter 7 — Audio & Transcription

| Manual feature | Status | Files | Evidence / Gap | Sev |
|---|---|---|---|---|
| 16 kHz mono Opus capture | FULLY WORKING | `lib/audio/tabAudioCapture.ts`, `audioStore.ts` | Per memory | — |
| Encrypted WebSocket to Deepgram | FULLY WORKING | `deepgram-token` edge fn (60s TTL temp key per memory) | Secure | — |
| Deepgram **Nova-3** | PARTIALLY WORKING | `profiles.deepgram_model` defaults to `nova-2` | **Manual says Nova-3** — drift | S2 |
| Speaker diarization (candidate vs interviewer color lanes) | PARTIALLY WORKING | `LiveOverlay.tsx`, transcript UI | Verify per-speaker color rendering | S2 |
| Panel mode multi-speaker colors | MISSING | — | No multi-speaker palette logic | S2 |
| Auto-punctuation | FULLY WORKING | Deepgram default | — | — |
| Custom vocabulary boost | MISSING | — | No UI to upload vocabulary, no Deepgram `keywords` param threaded | S2 |
| WPM / Filler / Silence / Volume metrics | FULLY WORKING | `lib/audio/speechMetrics.ts` (or similar), `coachStore.ts` | Per memory | — |
| Speaking ratio metric | PARTIALLY WORKING | unclear | Verify metric is computed and surfaced | S2 |
| Warmup calibrates baseline | PARTIALLY WORKING | `MockWarmup.tsx` | Verify baseline values are persisted and reused | S2 |
| Audio never permanently stored | FULLY WORKING (by design) | n/a | Only transcripts persisted | — |
| Mute/unmute hotkey Ctrl+Shift+M | FULLY WORKING | `lib/constants/hotkeys.ts` | — | — |

### Chapter 8 — Live AI Co-Pilot — **PARTIAL COMPLIANCE RISK**

| Manual feature | Status | Files | Evidence / Gap |
|---|---|---|---|
| 8.1 Auto-detect end-of-question + 2–4 s answer | **COMPLIANCE / POLICY RISK** | `hooks/useLiveCopilot.ts`, `generate-answer` | This is "hidden real-time interview assistance" by manual definition. Same risk as Ch. 6. |
| 8.1 Resume/JD/Answer Bank context injection | FULLY WORKING | `generate-answer/index.ts` | Plumbed |
| 8.1 Streaming display | FULLY WORKING | Streaming response | — |
| Ctrl+Shift+S Save / Ctrl+Shift+R Regen | FULLY WORKING | `save-answer`, hotkeys | — |
| 8.2 Multi-model routing **Claude 3.5 Sonnet / GPT-4o / Gemini Flash 2.0 / BYOK** | BROKEN — MANUAL CONTRADICTION | `generate-answer/index.ts`, `_shared/gemini.ts` | `DEFAULT_MODEL = "gemini-2.0-flash"`. **No Anthropic or OpenAI SDK path exists in any edge function.** Manual promises model routing that is not implemented. |
| 8.3 Screenshot capture @ 2 fps (Pro/Enterprise opt-in) | **COMPLIANCE / POLICY RISK + MISSING** | No `screen-parse` edge fn, no `getDisplayMedia` capture loop | Even the wiring is absent — recommend leaving it out |

### Chapter 9 — Analytics & Debriefs

| Manual feature | Status | Files | Evidence / Gap | Sev |
|---|---|---|---|---|
| Debrief auto-generated in 30–60 s | FULLY WORKING | `generate-debrief` edge fn, `debrief/Debrief.tsx` | Async pipeline | — |
| Encrypted transcript view | FULLY WORKING | `session_transcripts` + `debrief/DebriefDetail.tsx` | — | — |
| Question-by-question analysis | FULLY WORKING | `debriefs.recommendations`, `key_moments` jsonb | — | — |
| Missed Keywords Report | PARTIALLY WORKING | `gap-analysis` | Confirm surfaced in Debrief UI, not orphan | S2 |
| Vocal Analytics time-series chart | PARTIALLY WORKING | `Analytics.tsx`, recharts | Verify pace/volume/pause time series | S2 |
| AI Model Answer Library on debrief | PARTIALLY WORKING | `debriefs.summary` | Per-question model answer storage not clearly separated | S2 |
| Global Analytics: readiness trend / WPM histogram / filler reduction / topic heat map / XP progression | PARTIALLY WORKING | `Analytics.tsx`, `analytics-dashboard` edge fn | Some charts exist; verify all 5 are real not mock | S1 |
| Confidence Score formula (25/25/20/15/15) | NOT TESTABLE FROM CURRENT CODE | `generate-debrief` | Verify the weights in code match manual | S1 |

### Chapter 10 — Billing, Credits & Subscriptions

| Manual feature | Status | Files | Evidence / Gap | Sev |
|---|---|---|---|---|
| Per-action credit costs (5/12/8/10/15/20/6/10/3) | PARTIALLY WORKING | various edge fns calling `deduct_credits` | Costs are hard-coded per call site; **inconsistent** — needs central cost table to match manual numbers exactly | S1 |
| Free 200 / Pro 2,000 / Enterprise ∞ monthly credits | BROKEN — MANUAL CONTRADICTION | `handle_new_user()` grants **50 credits**, `subscriptions.monthly_credits = 50` | Manual says 200; current code says 50 | S0 |
| Pro $29/month | BROKEN — MANUAL CONTRADICTION | `pages/marketing/Pricing.tsx` (credit-pack model `500 credits $29.99`), project memory says Pro `$39/mo` | Three different price points across manual, code, memory | S0 |
| Stripe checkout | FULLY WORKING | `create-checkout`, `stripe-webhook` edge fns | — | — |
| Stripe portal | FULLY WORKING | `create-billing-portal` edge fn | — | — |
| Webhook plan sync | FULLY WORKING | `stripe-webhook` (canonical after prev-turn dedup) | — | — |
| Cancellation / downgrade end-of-period | PARTIALLY WORKING | `cancel-subscription`, `resume-subscription` | Verify period-end behavior, not immediate | S2 |
| No credit rollover | NOT VERIFIED | `credits_reset_at` field exists | Confirm monthly reset cron exists | S2 |
| Low-credit notification at 50 | PARTIALLY WORKING | `notifications` table | Threshold trigger not found in code | S2 |

### Chapter 11 — Settings & Advanced Configuration

| Manual feature | Status | Files | Evidence / Gap | Sev |
|---|---|---|---|---|
| Settings index `/app/settings` | FULLY WORKING | `Settings.tsx` | — | — |
| 11.1 BYOK OpenAI/Anthropic/Gemini | PARTIALLY WORKING | `SettingsBYOK.tsx`, `lib/byokVault.ts`, `validate-api-key` edge fn | Keys stored **in localStorage only** ("Keys are persisted only in local browser storage via byokVault"). **Manual claims AES-256 server-side encryption** — direct contradiction. | S1 |
| BYOK keys actually used in edge functions | DISCONNECTED | `generate-answer` reads `x-byok-*` headers? — verify | If headers aren't forwarded server-side, BYOK is cosmetic | S1 |
| 11.2 Retention controls (transcripts/docs/analytics/scorecard) | PARTIALLY WORKING | `SettingsPrivacy.tsx`, `profiles.data_retention_days`, `delete_expired_session_data()` | Sessions purged by cron; **documents and analytics ARE NOT purged** by the function | S1 |
| Audio chunks never stored | FULLY WORKING (by design) | — | — | — |
| 11.3 Private Mode network sever | PARTIALLY WORKING | `hooks/usePrivateMode.ts`, `hooks/useOfflineFallback.ts`, `lib/ai/offlineTemplates.ts` | Hook exists but does **not actually block fetch/WebSocket**; only renders OFFLINE badge | S1 |
| OFFLINE badge | FULLY WORKING | `LiveNetworkMonitor.tsx`, `networkStore.ts` | Renders | — |
| 11.4 Notifications (6 toggles) | PARTIALLY WORKING | `SettingsNotifications.tsx` → `profiles` JSONB | Toggles persist; **only credit-low and interview-day reminders have any backend wiring**. Streak reminder, weekly digest, product updates have **no scheduled sender** | S1 |
| Hotkey remapping | PARTIALLY WORKING | `SettingsHotkeys.tsx`, `lib/constants/hotkeys.ts` | UI shows hotkeys; verify they persist per-user (not just constants) | S2 |
| **Duplicate Settings pages** | DUPLICATE / LEGACY | 18 files vs ~10 manual sections | `SettingsSecurity` + `SettingsSecurityConfig`, `SettingsCredits` + `SettingsBilling` + `SettingsSubscription`, `SettingsModels` + `SettingsBYOK`, `SettingsPolish`, `SettingsData` | S2 |

### Chapter 12 — Troubleshooting, Export, Deletion, Security

| Manual feature | Status | Files | Evidence / Gap | Sev |
|---|---|---|---|---|
| 12.1 Audio troubleshooting tables | NOT TESTABLE / DOC-ONLY | — | Manual is documentation; verify in-app Help links to these | S3 |
| 12.2 Overlay troubleshooting | NOT TESTABLE / DOC-ONLY | — | Same | S3 |
| 12.3 Full JSON export | FULLY WORKING | `export-user-data` edge fn, `SettingsData.tsx`, `exports` bucket | Implemented | — |
| 12.3 Transcript-only export | PARTIALLY WORKING | `SettingsData.tsx` | Verify a transcript-only filter path | S2 |
| 12.3 Analytics CSV export | PARTIALLY WORKING | `SettingsData.tsx` | Verify CSV branch | S2 |
| 12.3 Permanent account deletion + 24h backup purge | PARTIALLY WORKING | `delete-account` edge fn, `SettingsDanger.tsx` | Live DB cascade likely OK; **"24h backup purge" claim** is provider-dependent and not provable in app code | S1 |
| 12.4 Security: OAuth 2.0 + PKCE, JWT 1h | FULLY WORKING (Supabase default) | — | — | — |
| 12.4 Bcrypt cost factor 12 | NOT TESTABLE (Supabase managed) | — | Cannot verify cost factor | S3 |
| 12.4 Rate limiting per user/IP | MISSING | — | No middleware in edge functions enforcing rate limits | S1 |
| 12.4 CORS whitelist | PARTIALLY WORKING | `supabase/functions/_shared/cors.ts` | Uses `*` not a whitelist — manual promises whitelist | S2 |
| 12.4 API key rotation every 90 days | MISSING | — | No documented rotation; `LOVABLE_API_KEY` is managed but unrotated | S2 |
| 12.4 Security audit log | MISSING | `admin_audit_log` exists for admin ops only | No per-user security audit log (logins, exports, deletions) | S1 |
| Session token invalidated on logout | FULLY WORKING | Supabase default | — | — |
| Quarterly pen-test / HackerOne | NOT TESTABLE / EXTERNAL CLAIM | — | Cannot verify; **remove from manual unless contracted** | S2 |

---

## 4. What Works Fully (Production-Ready)

1. Email/password & Google OAuth auth, email verification, redirect to onboarding.
2. 5-step onboarding wizard (route, persistence, completion gate).
3. Document hub: resume upload + multi-layer parse (Gemini→Claude→OCR), JD upload, per-user RLS, AES-256 at rest via Supabase.
4. Prep Lab: STAR Builder, Coding Hints, Rephraser, Company Research — full LLM round-trip with credits.
5. Interview scheduling (`scheduled_interviews`+`interview_rounds`).
6. Deepgram real-time transcription with temp-token security (60 s TTL).
7. Debrief generation + transcript persistence.
8. Stripe checkout, billing portal, webhook plan sync.
9. Full data export and permanent account deletion edge functions.
10. Dashboard core widgets (XP, streak, credit balance, notifications).

---

## 5. Partial / Broken / Missing

**Broken vs manual (S0/S1):**
- Free credit default (50 vs 200), Pro pricing ($39/$29.99/$29 conflict), no Enterprise ∞ rendering.
- Multi-model routing claim (Claude/GPT-4o/Gemini) — only Gemini implemented.
- Screen-capture capture loop (Ch. 8.3) — missing entirely.
- BYOK key storage (localStorage, not server-side AES-256 as manual promises).
- Mock-test product surface diverges from manual (competitive-exam MCQ vs interview Q&A).
- Audio session recording (missing — manual promises encrypted recording).
- Notification senders for streak/weekly-digest/interview-reminders (cron jobs absent).
- Rate limiting & security audit log (missing).
- XP awards per session diverge sharply (10/15 actual vs 150/40 manual).

**Disconnected:**
- Two parallel mock flows (`/app/mock` vs `/app/mock-test`).
- Document retention cleanup (table-only function, no fan-out to documents/analytics).
- Private Mode hook does not actually sever network calls.

**Missing:**
- LinkedIn / Azure AD OAuth providers.
- Cover-letter document type.
- Custom-vocabulary upload for Deepgram.
- Panel-mode multi-speaker colorization.
- Cron-scheduled interview reminders.
- Per-user security audit log.

---

## 6. Manual vs Actual Mismatch Report (top 15)

| # | Manual claim | Actual code | Severity |
|---|---|---|---|
| 1 | Pro = $29/month, Free = 200 credits, Enterprise = ∞ | $29.99 credit-pack pricing, 50-credit default, no ∞ UI | S0 |
| 2 | Multi-model routing across Claude 3.5 / GPT-4o / Gemini | Only `gemini-2.0-flash` is wired | S0 |
| 3 | OAuth Google/GitHub/LinkedIn/Azure AD | Only Google reliably; LinkedIn & Azure AD absent | S1 |
| 4 | Deepgram **Nova-3** | `profiles.deepgram_model` default `nova-2` | S2 |
| 5 | BYOK keys AES-256 server-side encrypted | `localStorage` via `byokVault.ts` | S1 |
| 6 | Mock XP +150 / Warmup +40 | Trigger awards +10/+15 | S1 |
| 7 | Encrypted full audio recording per session | Audio never persisted (good for privacy, contradicts manual) | S1 |
| 8 | Email + in-app reminders 24h / 1h pre-interview | No cron sender | S1 |
| 9 | Document retention 0–90 days configurable | Setting persists but no cleanup job for documents | S1 |
| 10 | Private Mode severs network | Hook flips a flag, fetches still execute | S1 |
| 11 | Stealth overlay invisible to Zoom/Teams | Implemented via Electron + SetWindowDisplayAffinity | **Compliance risk** |
| 12 | 2 fps screen capture in live coding | Not implemented at all | S2 + risk |
| 13 | Rate limiting per user/IP | None | S1 |
| 14 | CORS whitelist | `*` wildcard | S2 |
| 15 | Quarterly pen-test, HackerOne | External-process claim, no evidence | S2 |

---

## 7. Compliance / Policy / Risk Findings

| ID | Risk | Files | Recommendation |
|---|---|---|---|
| R1 | Real-time covert interview assistance ("crown jewel") | `useLiveCopilot.ts`, `generate-answer`, `LiveOverlay.tsx`, `OverlayAnswerStrength.tsx`, `OverlayChatPanel.tsx` | **Remove from production scope** or restrict to *practice-mode only* with visible disclosure and ToS gating |
| R2 | OS-level screen-capture evasion | `lib/stealth/screenCaptureBlocker.ts`, `lib/stealth/electronBridge.ts`, `electron/main.cjs` (BrowserWindow `skipTaskbar`, `setContentProtection`), `lib/overlay/screenCaptureEvasion.ts` | **Remove** the screen-capture-exclusion APIs; keep a visible overlay only |
| R3 | Panic Button concealment | `lib/stealth/stealthActions.ts`, `OverlayKeyboardHandler.tsx` | **Remove** ("panic" framing) |
| R4 | Opacity auto-fade + auto-hide on focus loss | `StealthMouseGuard.tsx`, `WindowVisibilityManager.tsx` | **Remove** stealth fade; keep manual minimize only |
| R5 | "No taskbar entry / Alt+Tab hidden" | `electron/main.cjs` | **Remove** `skipTaskbar:true` |
| R6 | Marketing copy in manual itself ("never detected", "invisible AI partner") | `ClarifyAI_Complete_Manual_1.pdf` | **Rewrite manual** — current copy creates fraud-facilitation exposure |
| R7 | Live coding screenshot capture (2 fps) of third-party platforms | Not implemented, but documented | **Drop from manual** |
| R8 | Security claims unverifiable (SOC 2, quarterly pen-test, HackerOne) | n/a | **Remove from manual** until contractually true |

---

## 8. End-to-End Flow Audit (top user journeys)

1. **Signup → Onboarding → First Mock → Debrief:** WORKS end-to-end, with caveats (XP numbers wrong, recording missing).
2. **Resume Upload → Parse → JD Upload → Gap Analysis → Prep Tools:** WORKS (cover letter missing).
3. **Schedule Interview → Calendar Sync → Reminder → Live Overlay:** Breaks at "Reminder" (no cron); Overlay = compliance risk.
4. **Upgrade to Pro → Stripe → Credits Refilled:** WORKS for checkout; **monthly credit amount is wrong** (50 → should be 2000).
5. **BYOK → Generate Answer with own key:** Broken at storage layer (localStorage) and at routing layer (only Gemini in edge fns).
6. **Export Data → Delete Account:** WORKS; backup-purge claim unverifiable.

---

## 9. Frontend Audit

- **Routing health:** 60+ authenticated routes in `App.tsx`, all lazy-loaded, wrapped in `RequireAuth`. ✅
- **Duplicate routes:** `/app/mock/session` vs `/app/mock-test/session/:testId` — two separate session orchestrators.
- **State stores (15 Zustand):** Generally clean; `overlayStore`+`sessionStore`+`audioStore`+`coachStore`+`networkStore` overlap conceptually in the live-session area; verify selector stability.
- **Hooks (42):** `useLiveCopilot`, `usePrivateMode`, `useOfflineFallback`, `useInterviewScheduler`, `useCreditWarning`(?) — confirm not orphaned.
- **Error boundaries:** Verify a top-level boundary in `App.tsx`; per-route boundary recommended.
- **Loading/empty states:** Generally good per memory; spot-check Dashboard widgets.
- **Accessibility:** Not audited this round; recommend axe sweep before launch.
- **Responsive:** "HireFlow" compact design per memory; not re-verified.

## 10. Backend / Edge Function Audit

38 functions. Healthy:
`ai-coach-chat, ai-feedback, analytics-dashboard, analyze-test-performance, cancel-subscription, company-research, create-billing-portal, create-checkout, create-test, deduct-credits, deepgram-token, delete-account, disconnect-calendar, end-session, export-user-data, gap-analysis, generate-answer, generate-debrief, generate-hint, generate-practice-questions, generate-questions, generate-star-answer, parse-question-pdf, parse-resume, ping, polish-star-section, prep-tool, resume-subscription, save-answer, save-transcript, select-test-questions, send-email, start-session, stripe-webhook, submit-test, sync-calendar, validate-api-key`

Cross-cutting concerns:
- **CORS:** central `_shared/cors.ts` uses `*` — manual claims whitelist.
- **Auth:** mostly `getClaims`-based; verify all paid endpoints check JWT.
- **Rate limit:** none. Add e.g. Upstash or Postgres-rate-limit.
- **Zod validation:** inconsistent — `start-session`, `generate-answer` validate; others (`save-answer`, `prep-tool`) may not.
- **Model routing:** all answer-generating fns hard-code Gemini. No Anthropic/OpenAI SDK present.

## 11. Database / Storage / RLS Audit

- **40+ tables**, all with RLS enabled (per linter). ✅
- **Storage buckets:** `resumes` (private), `documents` (private), `exports` (private), `avatars` (public), `question-images` (public). Aligns with privacy posture.
- **Schema drift:** `documents.type` enum likely lacks `cover_letter`; `interview_prep` table existed only in stale types (cleaned up last turn); `mock_tests` schema is exam-MCQ-flavored, not interview-Q&A.
- **Functions:** 14 admin/RPC functions. `mark_notifications_read` patched, server-only SECURITY DEFINER calls locked down (prev turn).
- **Triggers:** `update_user_streak()` awards 5/10/15 XP — **not 150/40 per manual**.

## 12. Billing / Auth / Admin / Settings Audit

- **Billing:** Stripe canonical webhook in place. Plan tiers in `plan_tier` enum (free/pro/enterprise). UI in Pricing page uses credit-pack model — **decide product model (subscription vs pack) and unify**.
- **Auth:** Google OAuth in `Login.tsx`. LinkedIn/GitHub/Azure AD not present.
- **Admin:** Rich admin suite (`AdminDashboard`, `AdminUsers`, `AdminRevenue`, `AdminFeatureFlags`, `AdminQuestionEditor`, `AdminAnalytics`, `AdminLiveChat`, `AdminModelCosts`, `AdminSeedQuestions`) — production-grade, gated via `has_role('admin')`.
- **Settings:** 18 pages, manual demands ~10. Consolidate or hide unused (`SettingsPolish`, `SettingsSecurityConfig`).

---

## 13. File-by-File Critical Audit (top 25)

| File | Verdict | Action |
|---|---|---|
| `supabase/functions/generate-answer/index.ts` | Hard-coded Gemini, manual promises Claude+GPT+Gemini | Add provider routing or rewrite manual |
| `supabase/functions/_shared/gemini.ts` | OK | — |
| `supabase/functions/handle_new_user (db fn)` | 50 credits vs manual 200 | Migration to 200 |
| `supabase/functions/stripe-webhook/index.ts` | Canonical (prev-turn dedup) | Verify plan→credits map |
| `src/pages/marketing/Pricing.tsx` | Credit-pack UI inconsistent with subscription model in manual | Rebuild to show Free/Pro/Enterprise tiers |
| `src/store/authStore.ts` (`byokKeys`) + `lib/byokVault.ts` | LocalStorage only | Move to server-side encrypted secret per user |
| `src/pages/app/settings/SettingsBYOK.tsx` | UI claim misleading vs reality | Update copy or move storage |
| `src/lib/stealth/*` (4 files) | Compliance risk | Delete |
| `src/lib/overlay/screenCaptureEvasion.ts` | Compliance risk | Delete |
| `src/components/overlay/StealthMouseGuard.tsx` | Compliance risk | Delete |
| `src/components/overlay/ScreenCaptureBlocker.tsx` | Compliance risk | Delete |
| `electron/main.cjs` | Compliance risk (`skipTaskbar`, content protection) | Strip flags, or stop shipping Electron build |
| `src/pages/app/mock/MockSession.tsx` vs `mock-test/TestSession.tsx` | Duplicate flows | Pick one; redirect other |
| `src/pages/app/mock-test/*` | Wrong domain (JEE/NEET) per manual | Decide whether to keep as separate product line |
| `src/pages/app/Dashboard.tsx` | Readiness formula unverified | Implement composite per manual |
| `src/hooks/usePrivateMode.ts` | Does not actually sever network | Wrap `fetch`/Supabase client |
| `src/hooks/useLiveCopilot.ts` | Compliance risk | Re-scope to practice-only |
| `supabase/functions/send-email/index.ts` | No cron callers | Add `pg_cron` reminder jobs |
| `supabase/functions/_shared/cors.ts` | `*` wildcard | Move to whitelist via env |
| `src/pages/app/settings/SettingsSecurity.tsx` + `SettingsSecurityConfig.tsx` | Duplicate | Merge |
| `src/pages/app/settings/SettingsCredits.tsx` + `SettingsBilling.tsx` + `SettingsSubscription.tsx` | Triplicate | Merge into one Billing page |
| `update_user_streak()` db fn | XP numbers wrong | Migration to match manual |
| `delete_expired_session_data()` db fn | Only covers session-family tables | Extend to documents + analytics per retention setting |
| `supabase/functions/parse-resume/index.ts` | Fan-out fixed last turn | OK |
| `src/pages/marketing/Privacy.tsx` & manual | Claims SOC 2 / pen-test / HackerOne | Remove or contract for |

---

## 14. Exact Files to Edit (top 12 actionable, P0/P1)

| # | Issue | Files | Change | P |
|---|---|---|---|---|
| 1 | Free credits 50 → 200 to match manual | DB migration on `handle_new_user()` + `subscriptions.monthly_credits` default + `profiles.credits` default | Update SQL defaults | P0 |
| 2 | Pricing tier UI mismatch | `src/pages/marketing/Pricing.tsx`, `src/pages/app/settings/SettingsBilling.tsx` | Show Free 200 / Pro 2,000 @ $29 / Enterprise ∞ | P0 |
| 3 | Strip stealth / evasion | Delete `src/lib/stealth/`, `src/lib/overlay/screenCaptureEvasion.ts`, `screenCaptureBlocker.ts`, `StealthMouseGuard`, `ScreenCaptureBlocker`; remove `setContentProtection`/`skipTaskbar` in `electron/main.cjs` | Replace with visible practice overlay | P0 |
| 4 | Rewrite manual Chapters 6 + 8.3 + parts of 8.1 | external doc | Remove "invisible / never detected / hidden during real interviews" language | P0 |
| 5 | Decide multi-model story | `supabase/functions/generate-answer/index.ts` + `_shared/` | Either add Anthropic/OpenAI SDK paths or update manual to "Gemini-only at launch" | P0 |
| 6 | Consolidate mock flows | Decide: keep `/app/mock` (interview practice) or `/app/mock-test` (MCQ) as canonical | Redirect deprecated route | P0 |
| 7 | BYOK server-side storage | Move from `byokVault` (localStorage) to per-user encrypted DB row + edge-fn decrypt | Update `SettingsBYOK` + `generate-answer` to read DB | P1 |
| 8 | Document & analytics retention purge | Extend `delete_expired_session_data()` to fan out per `profiles.data_retention_days` | DB migration | P1 |
| 9 | Cron reminders (24h / 1h / streak / weekly digest) | `pg_cron` + `send-email` invocations | New cron entries | P1 |
| 10 | Wire credit cost central table | New `credit_costs` table or constants + refactor edge fns to read it | Match manual table | P1 |
| 11 | Fix XP numbers | DB fn `update_user_streak()` and any post-session XP grant | +150 mock / +40 warmup / +25 first-of-day bonus | P1 |
| 12 | Private Mode actually sever network | `hooks/usePrivateMode.ts`, `lib/supabase/client.ts` | Block fetch/WS when flag set | P1 |

For every change above: **regression risk = medium** (touches credits / pricing / live session); always behind feature flags and ship one component at a time per your guardrails.

---

## 15. Priority-Based Fix Roadmap

**P0 (cannot launch without):**
- Items 1–6 above (credits, pricing, stealth removal, manual rewrite, model story, mock-flow consolidation).

**P1 (launch within 2 sprints):**
- Items 7–12 (BYOK, retention purge, reminders, cost table, XP numbers, Private Mode).
- Add rate limiting + tighten CORS.
- Add per-user security audit log.

**P2 (post-launch hardening):**
- LinkedIn / Azure AD OAuth providers.
- Cover-letter doc type + Deepgram custom vocabulary.
- Panel-mode multi-speaker colors.
- Consolidate Settings pages (18 → ~10).
- Verify Confidence-score formula weights (25/25/20/15/15).
- Replace mock data on Analytics charts with real queries.

**P3 (nice to have):**
- Realtime Supabase subscriptions for dashboard widgets.
- 50+ system-design scenarios seeded.
- Accessibility/axe sweep.

---

## 16. QA / Test Checklist (production)

**Smoke (per chapter):**
- [ ] Sign up via email → verify email → land on `/onboarding`.
- [ ] Complete 5-step wizard → land on `/app/dashboard`.
- [ ] Dashboard shows real XP, streak, credits, upcoming interviews.
- [ ] Upload resume PDF, DOCX, TXT; parsed fields appear; XP+20.
- [ ] Upload JD; gap analysis returns ≥1 talking point.
- [ ] STAR Builder → save to Answer Bank → appears in `/app/answers`.
- [ ] Coding Hints in 7 supported languages, 3 depth levels.
- [ ] Rephraser returns exactly 3 alternatives.
- [ ] Company Research returns 5 category sections.
- [ ] Schedule interview → row in `scheduled_interviews` + Google Calendar event (if connected).
- [ ] Upload CSV with manual columns → questions imported.
- [ ] Run Practice Session 5 Qs → debrief generated in ≤60 s with all sections.
- [ ] Warmup 5 minutes → +40 XP awarded.
- [ ] Live transcription appears within 500 ms of speech; speaker-color lanes present.
- [ ] WPM / filler / silence / volume metrics visible and update live.
- [ ] Credits decrement per-action per manual table; balance refreshes in ≤2 s.
- [ ] Stripe checkout → upgrade reflects in ≤60 s; plan-gated UI flips.
- [ ] Credit-low banner at <50.
- [ ] Cancel subscription → access continues until period end.
- [ ] BYOK key save → `validate-api-key` confirms; subsequent generation skips credit deduction.
- [ ] Private Mode → fetch to AI fails fast; OFFLINE badge shows.
- [ ] Each retention setting honored after cron run.
- [ ] Export full JSON → email link arrives; transcript-only and CSV are immediate.
- [ ] Account deletion → user cannot log in; rows in `profiles`, `sessions`, `documents`, `resumes` deleted.

**Failure-path tests:**
- [ ] Expired JWT on edge fn → 401.
- [ ] Insufficient credits on `generate-answer` → 402-ish JSON, no debit.
- [ ] Stripe webhook duplicate event → idempotent.
- [ ] CSV with missing required column → 400 with field name.
- [ ] PDF >10 MB → blocked client-side.
- [ ] Concurrent answer regen → no double-debit.

**Regression checklist:**
- [ ] Existing answer-bank rows still queryable.
- [ ] `mark_notifications_read` only affects caller (prev-turn fix).
- [ ] `add_credits` callable only via service role (prev-turn fix).
- [ ] All 60+ routes load without console errors.

**Release checklist:**
- [ ] Manual Ch. 6/8 rewritten or feature removed.
- [ ] Pricing single source of truth.
- [ ] Privacy policy aligned to actual retention behavior.
- [ ] ToS includes no-cheating clause.
- [ ] All P0 items above closed.

---

## 17. Final Launch Readiness Verdict

**RED — DO NOT LAUNCH** under the current manual.

Two paths to GREEN:

- **Path A (recommended):** Remove Chapter 6 stealth + Chapter 8.1/8.3 covert-assistance + Chapter 8.3 screen capture from the manual and from the product. Reposition as a *practice & post-interview analytics* tool. Then close P0 items 1, 2, 5, 6 and ship.
- **Path B (not recommended):** Keep stealth/covert features but ship only to a legally vetted, contracted enterprise customer with explicit anti-cheating attestation. This still requires P0 items 1, 2, 5, 6, plus formal legal review.

Either way, the P1 list (BYOK storage, retention purge, reminders, cost table, XP, Private Mode) is required for the manual's "production" promises to match reality.

---

> **What I would do next (one component at a time, with guardrails):**
> 1. Confirm **Path A or B** with you.
> 2. If Path A: file-by-file removal plan for `src/lib/stealth/*` and `electron/` flags (single PR), with **"do not touch live transcription / debrief pipeline"** guardrail.
> 3. Then DB migration to align `handle_new_user` credits to 200 + `update_user_streak` XP to 150/40, **without touching admin functions**.
> 4. Then Pricing UI/data alignment **without touching Stripe webhook** (prev-turn canonical).
> 5. Pause for verification after each.
