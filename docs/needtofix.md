Here’s a prompt you can paste into Lovable AI so it fixes these 9 issues end‑to‑end, using your existing Career Pilot codebase and Supabase setup.

***

## Master Fix Prompt for Lovable AI (Career Pilot)

You are working on an existing production codebase called **Career Pilot**, a full-stack interview preparation platform.

The repo has this structure (key parts only):

- `src/` React + TypeScript SPA
  - `pages/`, `components/`, `hooks/`, `network/`, `audio/`, `overlay/`, `prep/`, `mock/`, `mock-test/`, `live/`, etc.
  - Supabase client in `src/integrations/supabase/` or `src/supabase/`
  - Network utilities in `src/network/fetchEdge.ts`, `src/network/apiClient.ts`, `src/network/networkMonitor.ts`
  - Deepgram integration in `src/audio/deepgramClient.ts` and `src/audio/deepgramStream.ts`
- `supabase/functions/` — many Edge Functions:
  - `generate-questions`, `generate-answer`, `company-research`, `parse-resume`, `parse-question-pdf`, `prep-tool`, `polish-star-section`, `select-test-questions`, `deepgram-token`, `schedule-interview`, `sync-calendar`, `disconnect-calendar`, `analytics-dashboard`, etc.
  - Shared utilities under `supabase/functions/_shared/`:
    - `utils.ts`, `cors.ts`, `gemini.ts`, `requirePlan.ts`, `supabase.ts`, `types.ts`
- Supabase migrations in `supabase/migrations/` define tables: sessions, session_questions, session_answers, session_debriefs, scorecards, test_* tables, rooms, interviews, etc.

I already applied **critical fixes** to `_shared/utils.ts`, `_shared/gemini.ts`, and `_shared/cors.ts` to eliminate 502 boot crashes and CORS misconfig, including:

- Removed top-level `throw` on missing env vars (now logs and fails per-request instead of killing the function)
- Added BYOK headers to CORS allowlist
- Added proper handling for Gemini/OpenAI/Anthropic calls
- Ensured `requireAuth()` and `deductCredits()` use `.maybeSingle()` instead of `.single()`

Assume those three shared files are correct and up to date.

***

### Your Goal

Systematically fix the following **9 functional issues** in Career Pilot, wiring up frontend + Supabase Edge functions + database so everything works together in production:

1. **Mock interviews not starting / questions not generating**
2. **Deepgram streaming fails even with correct API key**
3. **Gemini assistant selected but no answers are returned**
4. **Overlay: minimize, add/edit, and UI issues**
5. **Mock test AI question generation and duplicate questions**
6. **Prep Lab tools disabled or not running even after inputs**
7. **Room creation not working**
8. **Interview scheduling not working**
9. **Resume upload: parse PDF, extract content, and auto-fill templates & answers**

Use the attached console log (errors from `paste.txt`) and `project-structure.txt` as a map of where things live. Many of these failures currently appear as **CORS errors + 502/400/406/404**, but the real causes are a mix of:

- Edge functions not handling CORS correctly
- Missing/incorrect env config for Supabase and Deepgram/Gemini
- Payload shape mismatches between frontend and edge functions
- Database queries using `.single()` where `.maybeSingle()` or `limit(1)` is needed
- UI state logic that keeps buttons disabled or overlay not interactive
- Missing or incomplete parsing of resume/Question PDF content

Your job is to **read the actual files and functions in this repo, not guess**, and implement concrete code changes.

***

### Global Constraints & Context

- Tech stack:
  - React + TypeScript (Vite)
  - Supabase (PostgREST + Edge Functions + RPCs)
  - Deepgram for audio streaming
  - Gemini / OpenAI / Anthropic via `_shared/utils.ts` and `_shared/gemini.ts`
- CORS:
  - All browser calls to Edge Functions must:
    - Use the `fetchEdge` helper from `src/network/fetchEdge.ts`
    - Return responses with `getCorsHeaders(req)` from `_shared/cors.ts`
    - Accept origins from:
      - `https://trycareerpilot.com`
      - `https://trycareerpilot.com`
      - `https://www.trycareerpilot.com`
      - Localhost dev ports
- Auth:
  - All user-facing Edge Functions should use `requireAuth(req)` and read `auth.userId` instead of trusting `user_id` from the client.
- Credits/plans:
  - Use `deductCredits` and `requirePlan` where those features are gated.
- Gemini:
  - Use `callAI()` from `_shared/utils.ts` or `geminiGenerate()` / `geminiChat()` from `_shared/gemini.ts`.
  - All AI calls must be robust to malformed JSON and handle failure with refunds where appropriate.

***

### Issues to Fix (Step-by-Step)

#### 1. Mock interviews (Live + non-live) are not creating / starting

Symptoms from code and logs:

- `supabase/functions/generate-questions/index.ts` called from:
  - `src/live/MockSession.tsx`
  - `src/mock/MockInterview.tsx` / `src/mock/MockSession.tsx`
- Console logs show:
  - Calls to `https://...supabase.co/functions/v1/generate-questions` failing with CORS and/or 502 (“Failed to send a request to the Edge Function”).

Tasks:

- Inspect `supabase/functions/generate-questions/index.ts`:
  - Ensure it starts with the standard CORS + auth pattern:

    ```ts
    Deno.serve(async (req) => {
      const cors = handleCors(req);
      if (cors) return cors;

      try {
        const auth = await requireAuth(req);
        const body = await parseBody<any>(req);
        // ...
      } catch (err) {
        if (err instanceof Response) return err;
        return errorResponse("Internal error", "INTERNAL_ERROR", 500, req);
      }
    });
    ```

  - Ensure it accepts the same body shape the frontend sends (check `MockSession.tsx` / `PreSessionSetup.tsx`).
  - If needed, normalize payload keys (e.g. `session_id` vs `sessionId`) and add validation with `requireFields`.

- Fix CORS in this function:
  - Ensure all responses use `getCorsHeaders(req)` via `successResponse` / `errorResponse`.
  - There must be no early return that bypasses CORS headers.

- Ensure that the function:
  - Uses `callAI` to generate a list of questions.
  - Persists them into `session_questions` (or equivalent test tables) if appropriate.
  - Returns a JSON payload matching what `MockSession.tsx` expects.

- Fix the frontend:
  - In `src/live/MockSession.tsx` and `src/mock/MockSession.tsx`, confirm we use `fetchEdgeJson("generate-questions", body)` or the Supabase `functions.invoke("generate-questions")` with the correct body.
  - Propagate errors to the UI with clear messages.

#### 2. Deepgram failing even though API key is correct

Symptoms:

- Logs show calls to `supabase/functions/deepgram-token` blocked by CORS and `net::ERR_FAILED`.
- Files:
  - `supabase/functions/deepgram-token/index.ts`
  - `src/audio/deepgramStream.ts`
  - `src/hooks/useDeepgramStream.ts`
  - `src/audio/deepgramClient.ts`

Tasks:

- Open `supabase/functions/deepgram-token/index.ts`:
  - Ensure it:
    - Uses `handleCors(req)` and `requireAuth(req)`.
    - Reads `DEEPGRAM_API_KEY` from env via `Deno.env.get`.
    - Does NOT throw at module level if the env is missing; instead returns `errorResponse` with a clear message.
  - Returns a signed/short-lived Deepgram token or proxies the API key in a safe way.

- Fix CORS:
  - All responses must carry `getCorsHeaders(req)`.

- Frontend:
  - In `deepgramStream.ts`, ensure the token is fetched via `fetchEdge("deepgram-token", ...)` or `functions.invoke("deepgram-token")`.
  - Handle token fetch failure gracefully and show a user-friendly error in the UI (e.g. “Audio streaming temporarily unavailable”).

- Ensure the env var `DEEPGRAM_API_KEY` is actually referenced and used.

#### 3. Gemini assistant selected but no answers appear

Symptoms:

- User selects Gemini model in Settings / Model switcher, but answer generation functions return nothing.
- Relevant files:
  - `supabase/functions/generate-answer/index.ts`
  - `_shared/utils.ts` (callAI)
  - `_shared/gemini.ts`
  - `src/ai/geminiClient.ts`
  - `src/hooks/useModelSwitcher.ts`
  - `src/ai/promptTemplates.ts`

Tasks:

- Verify that when Gemini is selected, the frontend passes the correct model name (e.g. `"gemini-2.0-flash"` or `"gemini-1.5-pro"`) into:
  - `generate-answer` EF request
  - `callAI` / `geminiGenerate` call.

- In `generate-answer/index.ts`:
  - Confirm it calls `callAI` with `{ model: selectedModel, messages, ... }`.
  - Ensure the model is one of the keys in `PROVIDER_MAP` in `_shared/utils.ts`.

- If `generate-answer` parses JSON from GeminI:
  - Use `parseJSON` from `_shared/gemini.ts` and provide sensible defaults.
  - Add a clear error if Gemini output is empty/invalid, and refund credits when needed.

- Fix any missing CORS or auth issues in this function similarly to (1).

#### 4. Overlay: minimize, add/edit, and UI issues

Symptoms:

- Minimize screen overlay not working.
- Add/edit overlay screens have UI issues (bad layout / alignment / pointer events).
- Related files (from project structure):
  - `src/overlay/OverlayWindow.tsx`
  - `src/overlay/OverlayToolbar.tsx`
  - `src/overlay/OverlayPositionManager.tsx`
  - `src/overlay/OverlayTabBar.tsx`
  - `src/overlay/OverlayResumePanel.tsx`
  - `src/hooks/useOverlayVisibility.ts`
  - `src/store/overlayStore.ts`

Tasks:

- Inspect `overlayStore` and `useOverlayVisibility`:
  - Ensure there is a clearly defined **“minimized”** state (e.g. `isMinimized: boolean` or `mode: "docked" | "floating" | "hidden"`).
  - Implement actions like `minimizeOverlay()`, `restoreOverlay()`, `toggleMinimize()`.

- In `OverlayWindow` and `OverlayToolbar`:
  - Wire the minimize button to the store actions.
  - Ensure minimized state:
    - Hides main panel but shows a small draggable pill or docked icon.
    - Still allows reopening on click.

- Fix layout/alignment issues:
  - Audit the main overlay panels (Question, Resume, Settings, Chat, etc.) for:
    - Overflow issues.
    - Misaligned buttons.
    - Elements hidden behind `pointer-events: none` or `opacity: 0` even when active.

- Add/Edit overlay screen polish:
  - Ensure TabBar and panel content uses consistent spacing, scrolling, and typography.
  - Fix any `aria-hidden` issues where focused elements are inside hidden/aria-hidden containers.

#### 5. Mock test AI questions and duplicates

Context:

- Mock Tests are separate from Mock Interviews.
- Files:
  - `supabase/functions/create-test/index.ts`
  - `supabase/functions/select-test-questions/index.ts`
  - `supabase/functions/generate-practice-questions/index.ts`
  - `src/mock-test/TestConfigure.tsx`
  - `src/mock-test/TestSession.tsx`
  - `src/mock-test/UploadQuestions.tsx`
  - `src/mock-test/TestRevision.tsx`
  - `supabase/migrations/*mocktestengine.sql`

Issues:

- “Generate AI questions in mock test” not working.
- Available questions show duplicates.

Tasks:

- Open `select-test-questions` and `generate-practice-questions` functions:
  - Ensure they:
    - Use `handleCors + requireAuth + parseBody`.
    - Correctly read input filters (topic, difficulty, count, etc.).
    - Query the proper tables (`test_questions` or `question_bank`) without generating duplicates.
  - Fix duplicates by:
    - Using `distinct on` if needed.
    - Or selecting by `id` with `<> ALL(previous_ids)` passed from the client.
    - Or adding a `random()` ordering with a limit and ensuring no duplicates per test.

- In `TestConfigure.tsx`:
  - Ensure the call to `select-test-questions` uses the exact payload shape the EF expects.
  - Handle 406/400 errors gracefully and show clear UI errors.

- Fix `.single()` / `.maybeSingle()` issues:
  - Anywhere a `select(...).eq(...).single()` is used and might legitimately have 0 rows, change to `.maybeSingle()`.

- Ensure the test creation flow:
  - `create-test` creates a test record.
  - `select-test-questions` attaches concrete questions to the test.
  - The UI shows these once and does not re-duplicate on refresh.

#### 6. Prep Lab tools disabled/not working

Context:

- Prep tools: STAR builder, rephraser, coding hints, system design helper, etc.
- Files:
  - `src/prep/PrepLab.tsx`
  - `supabase/functions/prep-tool/index.ts`
  - `supabase/functions/polish-star-section/index.ts`
- Errors in logs show CORS errors for `polish-star-section` and `prep-tool`.

Tasks:

- Fix the EFs `prep-tool` and `polish-star-section`:
  - Standard pattern: `handleCors`, `requireAuth`, `parseBody`, `callAI`, `successResponse`.
  - Ensure they expect exactly the fields the UI sends: e.g. `{ prompt, section, job_title, company, level, ... }`.
  - Use `requireFields` for simple validation.
  - Return a normalized JSON structure (e.g. `{ polished: "...", notes: [...] }`).

- In `PrepLab.tsx`:
  - Fix button disabled logic:
    - Buttons should be disabled only when required fields are empty or an EF call is in flight.
    - Verify that the state that tracks text inputs and selected tools is wired correctly to `disabled={...}`.
  - Ensure responses from EFs are displayed in the correct panels and stored in state.

#### 7. Creating room not working

Context:

- Practice Rooms feature.
- Files:
  - `src/rooms/NewRoom.tsx`
  - `src/rooms/PracticeRooms.tsx`
  - `src/hooks/useRoom.ts`
  - `supabase/functions` (if a function exists) or direct Supabase client calls.

Tasks:

- Identify how rooms are created:
  - Via Supabase client `from("rooms").insert(...)`.
  - Or via an EF like `supabase/functions/create-room/index.ts`.

- Fix the flow:
  - Ensure that the table name, columns (`id`, `user_id`, `title`, `settings`, etc.), and types match migrations.
  - Make sure userId comes from auth, not the client.
  - Handle errors (e.g. unique constraint, missing fields) and show messages in the UI.

#### 8. Scheduling interviews not working

Context:

- Scheduling feature uses calendar sync + Edge Functions.
- Files:
  - `supabase/functions/schedule-interview/index.ts`
  - `supabase/functions/sync-calendar/index.ts`
  - `supabase/functions/disconnect-calendar/index.ts`
  - `src/hooks/useInterviewScheduler.ts`
  - `src/hooks/useCalendarSync.ts`
  - `src/pages/interviews/NewInterview.tsx`

Tasks:

- In `schedule-interview` EF:
  - Fix CORS, auth, and body parsing as above.
  - Ensure the EF writes entries to the correct table (`interviews` or equivalent).
  - If it integrates with external calendars (Google, Outlook), handle API failures gracefully.

- In `useCalendarSync`:
  - Fix calls to `sync-calendar` and `disconnect-calendar`:
    - Use `fetchEdgeJson` or `functions.invoke` with correct paths and methods.
    - Handle CORS by ensuring the EF uses `getCorsHeaders`.

- In `NewInterview.tsx`:
  - Ensure the schedule form is wired to call `schedule-interview`.
  - Validate required fields before enabling the submit button.
  - Display errors from the EF.

#### 9. Resume upload and auto-fill for cover letter, resume template, and answers

Context:

- User uploads a resume during onboarding or from Documents.
- We want to:
  - Parse the PDF.
  - Extract key fields (name, contact, skills, experience, projects).
  - Use this context to:
    - Pre-fill resume template.
    - Pre-fill cover letter templates.
    - Feed into answer generation (generate-answer, prep tools, question-specific answers).

Files:

- `supabase/functions/parse-resume/index.ts`
- `src/hooks/useResumeContext.ts`
- `src/pages/documents/ResumeDetail.tsx`
- `src/onboarding/OnboardingStep5ResumeUpload.tsx`
- `src/ai/promptTemplates.ts` and `src/ai/resumeFallback.ts`
- Possibly `src/overlay/OverlayResumePanel.tsx`

Tasks:

- Fix `parse-resume` EF:
  - Accepts uploaded PDF (likely via multipart/form-data or base64).
  - Uses a PDF parser (existing utility) or a simple text extraction (if you see existing helpers).
  - Extracts structured fields into JSON: `{ name, email, phone, headline, skills: [...], experience: [...], projects: [...], education: [...] }`.
  - Stores parsed data in `resume_context` or similar table.
  - Returns the JSON to the frontend.

- Frontend usage:
  - In onboarding resume upload and `ResumeDetail.tsx`:
    - After upload, call `parse-resume`.
    - Store parsed context in `useResumeContext()` / a store.
    - Use this context to:
      - Auto-fill form fields in resume builder UI.
      - Provide variables to the cover-letter generator.
      - Pass as context to answer generation (e.g. `generate-answer` gets `{ resumeContext, question, company, role }`).

- Ensure that the overlay and prep tools that rely on resume context read from the same hook/store.

***

### Implementation Requirements

1. **Read and modify real files** in this repo. Do not invent new filenames or functions if equivalents already exist.
2. **Keep existing public APIs** backward compatible where possible (e.g. Edge Function names, main component names).
3. **Preserve feature gates and credit deduction**:
   - Keep `requirePlan` and `deductCredits` logic.
4. **CORS correctness**:
   - Every Edge Function must:
     - Call `handleCors(req)` at the top and return early for OPTIONS.
     - Use `successResponse` / `errorResponse` / `streamResponse` (or equivalent) that include `getCorsHeaders(req)`.
5. **Error handling**:
   - Never swallow errors silently.
   - Log server-side errors with `log(fn, "error", message, data)`.
   - Surface user-friendly errors in the UI (toasts, banners) without exposing secrets.
6. **Testing / verification**:
   - For each fixed feature, add or update at least one small test in `tests` or relevant `*.test.tsx` where present.
   - Manually verify flows where possible using mock data and console logs.

At the end, summarize:









Folder PATH listing
Volume serial number is F656-A8FA
C:.
|   .env.example
|   .gitignore
|   .replit
|   bun.lock
|   components.json
|   eslint.config.js
|   index.html
|   package-lock.json
|   package.json
|   playwright-fixture.ts
|   playwright.config.ts
|   postcss.config.js
|   prettier.config.js
|   project-structure.txt
|   README.md
|   replit.md
|   tailwind.config.ts
|   tsconfig.app.json
|   tsconfig.json
|   tsconfig.node.json
|   vite.config.ts
|   vitest.config.ts
|   
+---.lovable
|       plan.md
|       
+---attached_assets
|       image_1774083694287.png
|       image_1774092618223.png
|       image_1774178067233.png
|       Pasted--Clarity-Assistant-Interview-Preparation-Real-time-Call_1774061345392.txt
|       Pasted--Clarity-Assistant-Interview-Preparation-Real-time-Call_1774071732169.txt
|       Pasted--Clarity-Assistant-Interview-Preparation-Real-time-Call_1774077703517.txt
|       Pasted--Clarity-Assistant-Interview-Preparation-Real-time-Call_1774082375443.txt
|       Pasted--Clarity-Assistant-Interview-Preparation-Real-time-Call_1774084876038.txt
|       Pasted--Key-Features-1-Live-Interview-Assistance-Real-time-Rea_1774084899442.txt
|       Pasted--Key-Features-1-Live-Interview-Assistance-Real-time-Rea_1774088599004.txt
|       Pasted--Key-Features-1-Live-Interview-Assistance-Real-time-Rea_1774092880177.txt
|       Pasted--Key-Features-1-Live-Interview-Assistance-Real-time-Rea_1774106756106.txt
|       Pasted--Key-Features-1-Live-Interview-Assistance-Real-time-Rea_1774112071626.txt
|       Pasted--Key-Features-1-Live-Interview-Assistance-Real-time-Rea_1774182242320.txt
|       Pasted--Stealth-overlay-live-session-overhaul-What-Why-The-ste_1774106744758.txt
|       Pasted-Clarity-Assistant-Interview-Preparation-Real-time-Call-_1774038724067.txt
|       Pasted-Here-are-all-prompts-organized-into-8-focused-passes-or_1774071435443.txt
|       Pasted-Here-are-all-remaining-fixes-organized-into-5-focused-p_1774071518565.txt
|       Pasted-Here-is-the-complete-application-process-flow-and-a-ful_1774078301343.txt
|       Pasted-Here-is-the-complete-production-ready-prompt-you-can-us_1774186159243.txt
|       Pasted-Unexpected-Application-Error-Maximum-update-depth-excee_1774038524823.txt
|       Pasted-Unexpected-Application-Error-Maximum-update-depth-excee_1774061279350.txt
|       Pasted-Unexpected-Application-Error-Maximum-update-depth-excee_1774061361447.txt
|       Screenshot_20260323-013606_1774210196895.jpg
|       Screenshot_20260323-013620_1774210196884.jpg
|       Screenshot_20260323-013624_1774210196870.jpg
|       Screenshot_20260323-013629_1774210196904.jpg
|       Screenshot_20260323-013631_1774210196858.jpg
|       Screenshot_20260323-013637_1774210196816.jpg
|       
+---docs
|       API.md
|       ARCHITECTURE.md
|       AUDIT_2026-05-01.md
|       DATABASE.md
|       INSTALLATION.md
|       Issue prompts
|       PRODUCTION_AUDIT_2026-05-03.md
|       QA_MANUAL.md
|       QA_REPORT.md
|       README.md
|       STEALTH_FEATURES.md
|       
+---electron
|       main.cjs
|       preload.cjs
|       preload.ts
|       
+---public
|   |   CareerPilot_Question_Template.xlsx
|   |   favicon.png
|   |   llms.txt
|   |   manifest.json
|   |   placeholder.svg
|   |   robots.txt
|   |   sitemap.xml
|   |   
|   \---images
|           clarify-logo.png
|           
+---scripts
|       parse-catalog.py
|       post-merge.sh
|       sync-qa-status.py
|       
+---src
|   |   App.css
|   |   App.tsx
|   |   index.css
|   |   main.tsx
|   |   vite-env.d.ts
|   |   
|   +---components
|   |   |   NavLink.tsx
|   |   |   
|   |   +---admin
|   |   |       BlockEditor.tsx
|   |   |       BlockRenderer.tsx
|   |   |       blocks.ts
|   |   |       
|   |   +---auth
|   |   |       index.ts
|   |   |       OAuthButton.tsx
|   |   |       
|   |   +---billing
|   |   |       BillingHistory.tsx
|   |   |       CreditBalance.tsx
|   |   |       index.ts
|   |   |       PricingCard.tsx
|   |   |       UpgradeModal.tsx
|   |   |       
|   |   +---common
|   |   |       CommandPalette.tsx
|   |   |       ConfirmDialog.tsx
|   |   |       CookieConsent.tsx
|   |   |       EmptyState.tsx
|   |   |       ErrorFallback.tsx
|   |   |       index.ts
|   |   |       LoadingScreen.tsx
|   |   |       
|   |   +---layout
|   |   |       AppSidebar.tsx
|   |   |       AppTopBar.tsx
|   |   |       ErrorBoundary.tsx
|   |   |       index.ts
|   |   |       MarketingLayout.tsx
|   |   |       MobileNav.tsx
|   |   |       NetworkBanner.tsx
|   |   |       PageHeader.tsx
|   |   |       PlanGate.tsx
|   |   |       ProtectedRoute.tsx
|   |   |       SetupChecklist.tsx
|   |   |       
|   |   +---live
|   |   |       index.ts
|   |   |       LiveAIFeedback.tsx
|   |   |       LiveAnswerStream.tsx
|   |   |       LiveCodingProblemCapture.tsx
|   |   |       LiveHotKeyListener.tsx
|   |   |       LiveMetricsPanel.tsx
|   |   |       LiveNetworkMonitor.tsx
|   |   |       LivePanicButton.tsx
|   |   |       LiveSessionController.tsx
|   |   |       LiveSessionTimer.tsx
|   |   |       LiveTranscriptStream.tsx
|   |   |       
|   |   +---onboarding
|   |   |       index.ts
|   |   |       OnboardingProgress.tsx
|   |   |       
|   |   +---overlay
|   |   |       index.ts
|   |   |       OverlayActivityTimer.tsx
|   |   |       OverlayAnswerStrength.tsx
|   |   |       OverlayAnswerTimer.tsx
|   |   |       OverlayAudioBadge.tsx
|   |   |       OverlayAuditPanel.tsx
|   |   |       OverlayChatInput.tsx
|   |   |       OverlayChatPanel.tsx
|   |   |       OverlayHintPanel.tsx
|   |   |       OverlayHotkeyHelp.tsx
|   |   |       OverlayKeyboardHandler.tsx
|   |   |       OverlayNetworkBadge.tsx
|   |   |       OverlayPositionManager.tsx
|   |   |       OverlayQuestionBar.tsx
|   |   |       OverlayQuestionPreview.tsx
|   |   |       OverlayQuickStart.tsx
|   |   |       OverlayResizeHandles.tsx
|   |   |       OverlayResumePanel.tsx
|   |   |       OverlaySessionStats.tsx
|   |   |       OverlaySettings.tsx
|   |   |       OverlayTabBar.tsx
|   |   |       OverlayToolbar.tsx
|   |   |       OverlayWindow.tsx
|   |   |       ScreenCaptureBlocker.tsx
|   |   |       StealthMouseGuard.tsx
|   |   |       WindowVisibilityManager.tsx
|   |   |       
|   |   +---prep
|   |   |       CodeScratchpad.tsx
|   |   |       Whiteboard.tsx
|   |   |       
|   |   +---session
|   |   |       DebriefExtras.tsx
|   |   |       PreSessionSetup.tsx
|   |   |       PreSessionSetupWizard.tsx
|   |   |       
|   |   \---ui
|   |           accordion.tsx
|   |           alert-dialog.tsx
|   |           alert.tsx
|   |           aspect-ratio.tsx
|   |           avatar.tsx
|   |           Badge.tsx
|   |           breadcrumb.tsx
|   |           Button.tsx
|   |           Card.tsx
|   |           carousel.tsx
|   |           chart.tsx
|   |           checkbox.tsx
|   |           command.tsx
|   |           context-menu.tsx
|   |           dialog.tsx
|   |           drawer.tsx
|   |           dropdown-menu.tsx
|   |           Dropdown.tsx
|   |           form.tsx
|   |           hover-card.tsx
|   |           index.ts
|   |           input-otp.tsx
|   |           Input.tsx
|   |           label.tsx
|   |           menubar.tsx
|   |           Modal.tsx
|   |           navigation-menu.tsx
|   |           pagination.tsx
|   |           popover.tsx
|   |           progress.tsx
|   |           ProgressBar.tsx
|   |           radio-group.tsx
|   |           resizable.tsx
|   |           scroll-area.tsx
|   |           select.tsx
|   |           separator.tsx
|   |           sheet.tsx
|   |           sidebar.tsx
|   |           skeleton.tsx
|   |           SkeletonLoader.tsx
|   |           slider.tsx
|   |           sonner.tsx
|   |           Spinner.tsx
|   |           switch.tsx
|   |           table.tsx
|   |           Tabs.tsx
|   |           textarea.tsx
|   |           ThemeToggle.tsx
|   |           toast-container.tsx
|   |           toast.tsx
|   |           toaster.tsx
|   |           toggle-group.tsx
|   |           Toggle.tsx
|   |           tooltip.tsx
|   |           use-toast.ts
|   |           
|   +---hooks
|   |       index.ts
|   |       use-mobile.tsx
|   |       use-toast.ts
|   |       useAnalytics.ts
|   |       useAudioCapture.ts
|   |       useAudioSession.ts
|   |       useAuth.ts
|   |       useCalendarSync.ts
|   |       useConfidenceScore.ts
|   |       useCredits.ts
|   |       useDeepgramStream.ts
|   |       useDocumentManager.ts
|   |       useDocuments.ts
|   |       useFillerWordDetection.ts
|   |       useGamification.ts
|   |       useHotkeys.ts
|   |       useInterviewScheduler.ts
|   |       useLiveCopilot.ts
|   |       useLocalStorage.ts
|   |       useModelSwitcher.ts
|   |       useNetworkMonitor.ts
|   |       useNotifications.ts
|   |       useOfflineFallback.ts
|   |       useOverlayVisibility.ts
|   |       usePageMeta.ts
|   |       usePrivateMode.ts
|   |       useResumeContext.ts
|   |       useRoom.ts
|   |       useSafeTabShare.ts
|   |       useScorecard.ts
|   |       useSentimentAnalysis.ts
|   |       useSessionContext.ts
|   |       useSessionOrchestrator.ts
|   |       useSilenceBoundary.ts
|   |       useSpeakerDiarization.ts
|   |       useSpeechRecognition.ts
|   |       useSTARBuilder.ts
|   |       useStealthMouse.ts
|   |       useStreakTracker.ts
|   |       useSystemAudio.ts
|   |       useWPMTracker.ts
|   |       useXPSystem.ts
|   |       
|   +---integrations
|   |   \---supabase
|   |           client.ts
|   |           index.ts
|   |           types.ts
|   |           
|   +---lib
|   |   |   env.ts
|   |   |   errors.ts
|   |   |   referrals.ts
|   |   |   utils.ts
|   |   |   
|   |   +---ai
|   |   |       anthropicClient.ts
|   |   |       contextEnvelopeBuilder.ts
|   |   |       geminiClient.ts
|   |   |       index.ts
|   |   |       localQuestionBank.ts
|   |   |       modelMapping.ts
|   |   |       modelRouter.ts
|   |   |       offlineTemplates.ts
|   |   |       openaiClient.ts
|   |   |       promptTemplates.ts
|   |   |       questionDetection.ts
|   |   |       resumeFallback.ts
|   |   |       
|   |   +---audio
|   |   |       audioCapture.ts
|   |   |       audioMixer.ts
|   |   |       audioProcessor.ts
|   |   |       deepgramClient.ts
|   |   |       deepgramStream.ts
|   |   |       diarization.ts
|   |   |       fillerDetector.ts
|   |   |       index.ts
|   |   |       micCapture.ts
|   |   |       screenshotCapture.ts
|   |   |       silenceDetector.ts
|   |   |       speechMetricsCalculator.ts
|   |   |       systemAudioCapture.ts
|   |   |       vadDetector.ts
|   |   |       volumeMonitor.ts
|   |   |       wpmTracker.ts
|   |   |       
|   |   +---billing
|   |   |       creditDeductionMiddleware.ts
|   |   |       creditsManager.ts
|   |   |       index.ts
|   |   |       priceCalculator.ts
|   |   |       subscriptionManager.ts
|   |   |       
|   |   +---capture
|   |   |       screenShare.ts
|   |   |       tabAudioCapture.ts
|   |   |       
|   |   +---constants
|   |   |       apiEndpoints.ts
|   |   |       colors.ts
|   |   |       errorMessages.ts
|   |   |       features.ts
|   |   |       hotkeys.ts
|   |   |       index.ts
|   |   |       version.ts
|   |   |       
|   |   +---network
|   |   |       apiClient.ts
|   |   |       fetchEdge.ts
|   |   |       index.ts
|   |   |       networkMonitor.ts
|   |   |       webSocketManager.ts
|   |   |       
|   |   +---overlay
|   |   |       hotkeys.ts
|   |   |       index.ts
|   |   |       IndexManager.ts
|   |   |       overlayCompositor.ts
|   |   |       screenCaptureEvasion.ts
|   |   |       stealthMouse.ts
|   |   |       useDocumentPiP.ts
|   |   |       windowManager.ts
|   |   |       zIndexManager.ts
|   |   |       
|   |   +---security
|   |   |       byokVault.ts
|   |   |       
|   |   +---session
|   |   |       interviewerPersonality.ts
|   |   |       sessionLifecycle.ts
|   |   |       
|   |   +---stealth
|   |   |       electronBridge.ts
|   |   |       screenCaptureBlocker.ts
|   |   |       stealthActions.ts
|   |   |       stealthConfig.ts
|   |   |       
|   |   +---storage
|   |   |       index.ts
|   |   |       indexedDB.ts
|   |   |       localStorage.ts
|   |   |       sessionStorage.ts
|   |   |       
|   |   +---supabase
|   |   |       auth.ts
|   |   |       client.ts
|   |   |       database.ts
|   |   |       index.ts
|   |   |       realtime.ts
|   |   |       storage.ts
|   |   |       
|   |   +---utils
|   |   |       arrayUtils.ts
|   |   |       dateUtils.ts
|   |   |       fileUtils.ts
|   |   |       formatters.ts
|   |   |       hashUtils.ts
|   |   |       index.ts
|   |   |       objectUtils.ts
|   |   |       stringUtils.ts
|   |   |       urlUtils.ts
|   |   |       
|   |   \---validators
|   |           audioValidator.ts
|   |           emailValidator.ts
|   |           index.ts
|   |           resumeValidator.ts
|   |           
|   +---pages
|   |   |   index.ts
|   |   |   NotFound.tsx
|   |   |   Scorecard.tsx
|   |   |   
|   |   +---app
|   |   |   |   Analytics.tsx
|   |   |   |   Dashboard.tsx
|   |   |   |   index.ts
|   |   |   |   InterviewDay.tsx
|   |   |   |   Notifications.tsx
|   |   |   |   Profile.tsx
|   |   |   |   Referrals.tsx
|   |   |   |   
|   |   |   +---admin
|   |   |   |       Admin.tsx
|   |   |   |       AdminAnalytics.tsx
|   |   |   |       AdminDashboard.tsx
|   |   |   |       AdminFeatureFlags.tsx
|   |   |   |       AdminLayout.tsx
|   |   |   |       AdminLiveChat.tsx
|   |   |   |       AdminModelCosts.tsx
|   |   |   |       AdminQuestionEditor.tsx
|   |   |   |       AdminRevenue.tsx
|   |   |   |       AdminSeedQuestions.tsx
|   |   |   |       AdminUsers.tsx
|   |   |   |       index.ts
|   |   |   |       
|   |   |   +---answer-bank
|   |   |   |       AnswerBank.tsx
|   |   |   |       AnswerDetail.tsx
|   |   |   |       index.ts
|   |   |   |       
|   |   |   +---company-research
|   |   |   |       CompanyProfile.tsx
|   |   |   |       CompanyResearch.tsx
|   |   |   |       index.ts
|   |   |   |       
|   |   |   +---debrief
|   |   |   |       Debrief.tsx
|   |   |   |       DebriefDetail.tsx
|   |   |   |       index.ts
|   |   |   |       
|   |   |   +---documents
|   |   |   |       Documents.tsx
|   |   |   |       index.ts
|   |   |   |       JDDetail.tsx
|   |   |   |       ResumeDetail.tsx
|   |   |   |       
|   |   |   +---guide
|   |   |   |       Guide.tsx
|   |   |   |       
|   |   |   +---interviews
|   |   |   |       index.ts
|   |   |   |       InterviewDetail.tsx
|   |   |   |       Interviews.tsx
|   |   |   |       NewInterview.tsx
|   |   |   |       
|   |   |   +---live
|   |   |   |       index.ts
|   |   |   |       LiveOverlay.tsx
|   |   |   |       LiveRehearsal.tsx
|   |   |   |       MockSession.tsx
|   |   |   |       
|   |   |   +---mock
|   |   |   |       index.ts
|   |   |   |       MockInterview.tsx
|   |   |   |       MockSession.tsx
|   |   |   |       MockWarmup.tsx
|   |   |   |       
|   |   |   +---mock-test
|   |   |   |       ExamPapers.tsx
|   |   |   |       ExcelImportTab.tsx
|   |   |   |       MockTestHub.tsx
|   |   |   |       MyQuestions.tsx
|   |   |   |       TestAnalytics.tsx
|   |   |   |       TestConfigure.tsx
|   |   |   |       TestResults.tsx
|   |   |   |       TestRevision.tsx
|   |   |   |       TestSession.tsx
|   |   |   |       UploadQuestions.tsx
|   |   |   |       
|   |   |   +---prep
|   |   |   |       CodingHints.tsx
|   |   |   |       index.ts
|   |   |   |       PrepLab.tsx
|   |   |   |       ProjectBuilder.tsx
|   |   |   |       Rephraser.tsx
|   |   |   |       StarBuilder.tsx
|   |   |   |       SystemDesign.tsx
|   |   |   |       
|   |   |   +---rooms
|   |   |   |       index.ts
|   |   |   |       NewRoom.tsx
|   |   |   |       PracticeRooms.tsx
|   |   |   |       RoomSession.tsx
|   |   |   |       
|   |   |   +---sessions
|   |   |   |       CallSessions.tsx
|   |   |   |       index.ts
|   |   |   |       SessionDetail.tsx
|   |   |   |       SessionHistory.tsx
|   |   |   |       
|   |   |   \---settings
|   |   |           index.ts
|   |   |           Settings.tsx
|   |   |           SettingsAppearance.tsx
|   |   |           SettingsAudio.tsx
|   |   |           SettingsBilling.tsx
|   |   |           SettingsBYOK.tsx
|   |   |           SettingsCredits.tsx
|   |   |           SettingsDanger.tsx
|   |   |           SettingsData.tsx
|   |   |           SettingsHotkeys.tsx
|   |   |           SettingsIntegrations.tsx
|   |   |           SettingsModels.tsx
|   |   |           SettingsNotifications.tsx
|   |   |           SettingsPolish.tsx
|   |   |           SettingsPrivacy.tsx
|   |   |           SettingsProfile.tsx
|   |   |           SettingsSecurity.tsx
|   |   |           SettingsSecurityConfig.tsx
|   |   |           SettingsSubscription.tsx
|   |   |           
|   |   +---auth
|   |   |       AuthCallback.tsx
|   |   |       index.ts
|   |   |       Login.tsx
|   |   |       ResetPassword.tsx
|   |   |       Signup.tsx
|   |   |       VerifyEmail.tsx
|   |   |       
|   |   +---marketing
|   |   |       Blog.tsx
|   |   |       BlogPost.tsx
|   |   |       Help.tsx
|   |   |       HelpArticle.tsx
|   |   |       index.ts
|   |   |       Landing.tsx
|   |   |       Pricing.tsx
|   |   |       Privacy.tsx
|   |   |       Shortcuts.tsx
|   |   |       Terms.tsx
|   |   |       
|   |   \---onboarding
|   |           index.ts
|   |           OnboardingIndex.tsx
|   |           OnboardingStep1Role.tsx
|   |           OnboardingStep2Experience.tsx
|   |           OnboardingStep3Preferences.tsx
|   |           OnboardingStep4AudioSetup.tsx
|   |           OnboardingStep5ResumeUpload.tsx
|   |           
|   +---store
|   |       answerBankStore.ts
|   |       audioStore.ts
|   |       authStore.ts
|   |       coachStore.ts
|   |       documentStore.ts
|   |       globalStore.ts
|   |       index.ts
|   |       interviewSchedulerStore.ts
|   |       networkStore.ts
|   |       notificationStore.ts
|   |       overlayStore.ts
|   |       sessionStore.ts
|   |       themeStore.ts
|   |       uiStore.ts
|   |       userStore.ts
|   |       
|   +---test
|   |   |   example.test.ts
|   |   |   setup.ts
|   |   |   
|   |   +---hooks
|   |   |       useAuth.test.ts
|   |   |       useCredits.test.ts
|   |   |       useLocalStorage.test.ts
|   |   |       usePrivateMode.test.ts
|   |   |       
|   |   +---lib
|   |   |   +---audio
|   |   |   |       fillerDetector.test.ts
|   |   |   |       wpmTracker.test.ts
|   |   |   |       
|   |   |   +---billing
|   |   |   |       creditsManager.test.ts
|   |   |   |       
|   |   |   +---overlay
|   |   |   |       hotkeys.test.ts
|   |   |   |       
|   |   |   +---utils
|   |   |   |       formatters.test.ts
|   |   |   |       hashUtils.test.ts
|   |   |   |       
|   |   |   \---validators
|   |   |           emailValidator.test.ts
|   |   |           
|   |   +---overlay
|   |   |       overlayPillMode.test.ts
|   |   |       
|   |   +---_generated
|   |   |       catalog.json
|   |   |       
|   |   \---_placeholders
|   |           account-creation-authentication.todo.test.ts
|   |           api-testing.todo.test.ts
|   |           billing-subscriptions.todo.test.ts
|   |           cross-platform-testing.todo.test.ts
|   |           dashboard-navigation.todo.test.ts
|   |           document-management.todo.test.ts
|   |           functional-testing.todo.test.ts
|   |           integration-testing.todo.test.ts
|   |           interview-preparation-tools.todo.test.ts
|   |           live-overlay-system-desktop.todo.test.ts
|   |           mock-test-sessions.todo.test.ts
|   |           onboarding-wizard-5-steps.todo.test.ts
|   |           performance-testing.todo.test.ts
|   |           post-interview-analytics.todo.test.ts
|   |           regression-testing.todo.test.ts
|   |           security-testing.todo.test.ts
|   |           settings-configuration.todo.test.ts
|   |           ui-ux-testing.todo.test.ts
|   |           
|   \---types
|           ai.types.ts
|           analytics.types.ts
|           api.types.ts
|           audio.types.ts
|           billing.types.ts
|           constants.types.ts
|           document.types.ts
|           error.types.ts
|           gamification.types.ts
|           index.ts
|           interview.types.ts
|           notification.types.ts
|           onboarding.types.ts
|           overlay.types.ts
|           room.types.ts
|           session.types.ts
|           supabase.types.ts
|           user.types.ts
|           
\---supabase
    |   config.toml
    |   
    +---.temp
    |       cli-latest
    |       
    +---functions
    |   +---ai-coach-chat
    |   |       index.ts
    |   |       
    |   +---ai-feedback
    |   |       index.ts
    |   |       
    |   +---analytics-dashboard
    |   |       index.ts
    |   |       
    |   +---analyze-test-performance
    |   |       index.ts
    |   |       
    |   +---cancel-subscription
    |   |       index.ts
    |   |       
    |   +---company-research
    |   |       index.ts
    |   |       
    |   +---create-checkout
    |   |       index.ts
    |   |       
    |   +---create-test
    |   |       index.ts
    |   |       
    |   +---deduct-credits
    |   |       index.ts
    |   |       
    |   +---deepgram-token
    |   |       index.ts
    |   |       
    |   +---delete-account
    |   |       index.ts
    |   |       
    |   +---disconnect-calendar
    |   |       index.ts
    |   |       
    |   +---end-session
    |   |       index.ts
    |   |       
    |   +---export-user-data
    |   |       index.ts
    |   |       
    |   +---gap-analysis
    |   |       index.ts
    |   |       
    |   +---generate-answer
    |   |       index.ts
    |   |       
    |   +---generate-debrief
    |   |       index.ts
    |   |       
    |   +---generate-hint
    |   |       index.ts
    |   |       
    |   +---generate-practice-questions
    |   |       index.ts
    |   |       
    |   +---generate-questions
    |   |       index.ts
    |   |       
    |   +---generate-star-answer
    |   |       index.ts
    |   |       
    |   +---parse-question-pdf
    |   |       index.ts
    |   |       
    |   +---parse-resume
    |   |       index.ts
    |   |       
    |   +---ping
    |   |       index.ts
    |   |       
    |   +---polish-star-section
    |   |       index.ts
    |   |       
    |   +---prep-tool
    |   |       index.ts
    |   |       
    |   +---process-stripe-webhook
    |   |       index.ts
    |   |       
    |   +---resume-subscription
    |   |       index.ts
    |   |       
    |   +---schedule-interview
    |   |       index.ts
    |   |       
    |   +---select-test-questions
    |   |       index.ts
    |   |       
    |   +---send-email
    |   |       index.ts
    |   |       
    |   +---start-session
    |   |       index.ts
    |   |       
    |   +---stripe-webhook
    |   |       index.ts
    |   |       
    |   +---submit-test
    |   |       index.ts
    |   |       
    |   +---sync-calendar
    |   |       index.ts
    |   |       
    |   +---validate-api-key
    |   |       index.ts
    |   |       
    |   \---_shared
    |           cors.ts
    |           examTypeMap.ts
    |           gemini.ts
    |           requirePlan.ts
    |           supabase.ts
    |           types.ts
    |           utils.ts
    |           
    \---migrations
            20260318032847_d6ef0486-2387-4402-ba66-d8a0eb3df846.sql
            20260321000000_add_missing_tables.sql
            20260322000000_add_subscription_billing_amount.sql
            20260322000001_add_increment_credits_rpc.sql
            20260322010000_add_referrals_table.sql
            20260322010000_calendar_sync_columns.sql
            20260323000000_mock_test_engine.sql
            20260323000001_create_test_atomic.sql
            20260323000002_submit_test_atomic.sql
            20260323000003_acquire_submit_lock.sql
            20260323000004_submit_test_v2.sql
            20260323010000_add_refund_credits_rpc.sql
            20260323010001_add_answer_bank_favourite.sql
            20260326015605_b22a9800-63d9-45f8-8e86-c7985e60965a.sql
            20260331023945_1087eeba-2851-4d2b-ba42-d4a22372e69c.sql
            20260401024557_a394e39c-fa98-4ab0-bdcf-2e92bf79f23e.sql
            20260403045505_975427e9-90c7-4e37-a803-c11e6c6c6615.sql
            20260405010208_a4f1a02a-a9eb-4f48-82bb-80b7d1bab00a.sql
            20260413024236_eaed2f00-bd76-4554-b28c-edf3b3cc9fea.sql
            20260416022447_845b758e-c548-4324-a09e-983b9a078bdf.sql
            20260418165604_8c2c1865-ddcf-4967-88b2-7136f75bc424.sql
            20260418165858_e744c4ee-e68b-4227-839e-b5065e39a47d.sql
            20260418170917_3d32f859-ea40-4b99-a6b2-010c67e2c5f6.sql
            20260430204228_576139ec-eb23-40fb-ac43-a3dcb5e08192.sql
            20260430204307_c1c01a63-67e2-4290-9207-2e1f6bdaf554.sql
            20260504024629_f19e2b3c-b485-49b4-b45e-d9995e81870d.sql
            20260504150325_fce73b68-83be-476c-995e-04e470c51ad5.sql
            20260507041140_5b6ae615-968c-422b-b609-4ca3d7568825.sql
            20260507061743_1cc08af1-e4de-4dd1-92b3-9a8f0ac2fc26.sql
            20260511154610_25cb3874-b41d-4b8d-8ebd-c94ccc6bc27a.sql
            20260513030357_325416f3-a0a9-4ade-bfc5-e127b416e390.sql
            


- Exactly which files you changed.
- For each of the 9 issues above, a short “Before → After” explanation.
- Any remaining TODOs (e.g. env vars required in production, limits, or assumptions).
