

# Fix Plan: Overlay Answers, Dual Audio, Session Timer, Mock Test Questions

## Issues Identified

### 1. AI Answers Not Generating
**Root cause**: The `geminiClient.ts` sends `resume_text` in the request body but the `generate-hint` edge function reads `resume_context`. The field name mismatch means context is lost. Additionally, the `generate-hint` function returns hints as plain text but the overlay's `commitStreamedHint()` expects the hint to arrive via `appendStreamChunk` — since `streamGeminiHint` delivers the entire hint as one chunk and then calls `onDone`, the overlay state transitions (`generating` → `streaming` → `idle`) happen too fast. The overlay's `OverlayHintPanel` may not render the content if `hint_state` transitions through states without the `current_hint` being properly set via `commitStreamedHint`.

**Fix**: 
- Align field names in `geminiClient.ts` body to match what `generate-hint` expects (`resume_context` instead of `resume_text`)
- Ensure `streamGeminiHint` sets `hint_state` to `"streaming"` before delivering the chunk, so the overlay renders it
- Add transcript context to the hint request so answers are based on what was said

### 2. System Audio Not Working (Both Streams from Mic Only)
**Root cause**: `useAudioSession.start()` only attempts system audio if `opts.enableSystemAudio` is `true`, but `DEFAULT_CONFIG` in `LiveRehearsal.tsx` sets `enable_system_audio: false`. Users must manually toggle system audio after session start. The toggle works via `window.confirm()` dialog which is clunky.

**Fix**:
- In `PreSessionSetupWizard` step 6 (Connect), add a clear toggle for "Capture interviewer audio (system audio)" that sets `enable_system_audio: true` in the config
- When system audio is enabled in config, auto-prompt the tab share dialog on session start
- Show clear status in overlay header: "MIC ONLY" vs "DUAL AUDIO"

### 3. Session Timer Never Ends (No Time Warning)
**Root cause**: `LiveSessionController` ticks `elapsed_seconds` indefinitely. There is no `duration_limit` in the session config and no logic to warn or auto-stop when a configured duration is reached. The `LiveSessionConfig` type has no `duration_minutes` field.

**Fix**:
- Add `duration_minutes` to `LiveSessionConfig` type
- Add time-remaining warning in `LiveSessionController`: at 5 min, 2 min, and 30 sec before the configured limit
- Show visual warning in the overlay header when time is running low
- Auto-end session when time expires (with confirmation toast)

### 4. Mock Test Showing Empty Questions
**Root cause**: The `exam_papers` table has entries for years 2016-2026, but questions only exist for years 2018-2022. When a user clicks "Start Exam" on a 2023, 2024, 2025, or 2026 paper, the `select-test-questions` function finds zero matching questions. Additionally, exam type names don't match between `exam_papers` and `questions` tables (e.g., `SSC CGL` vs `SSC Exams (CGL/CHSL)`, `IBPS PO` vs `Banking (IBPS/SBI/RBI)`).

**Fix**:
- Update `examTypeMap.ts` to handle all DB exam type variations
- Add `source_year` filtering in `select-test-questions` when `year_range` is provided
- Use the AI gateway skill to generate 500+ additional questions covering years 2023-2025 for JEE, NEET, UPSC, SSC, Banking exams and seed them via migration
- Remove exam paper entries for years where no questions can exist (2026, future years)

### 5. Overlay Sometimes Not Appearing
**Root cause**: The `overlayRoot` fallback chain in `OverlayWindow.tsx` looks for `#overlay-root` in the document. If `index.html` doesn't have `<div id="overlay-root"></div>`, the portal target falls back to `document.body` which can cause z-index conflicts. Also, if `is_visible` is not set to true during session start, the overlay won't render.

**Fix**:
- Verify `index.html` has `<div id="overlay-root"></div>` 
- Ensure `showOverlay()` is called reliably in `startLiveSession`
- Add a fallback: if overlay root is missing, create it dynamically

## Implementation Steps

1. **Fix AI hint generation pipeline** — align field names, add transcript context, fix state transitions
2. **Fix system audio config flow** — add toggle in setup wizard, pass config correctly
3. **Add session timer warnings** — duration_minutes support, visual warnings, auto-end
4. **Fix exam type mapping** — align DB values between exam_papers and questions
5. **Seed 500+ questions** — use AI gateway to generate questions for missing years, insert via migration
6. **Fix overlay reliability** — ensure overlay-root exists, fallback creation

## Files Modified
- `src/lib/ai/geminiClient.ts` — fix field names, add transcript
- `src/pages/app/live/LiveRehearsal.tsx` — fix default config
- `src/components/session/PreSessionSetupWizard.tsx` — add system audio toggle + duration
- `src/components/live/LiveSessionController.tsx` — add timer warnings
- `src/types/session.types.ts` — add duration_minutes
- `supabase/functions/_shared/examTypeMap.ts` — add missing mappings
- `supabase/functions/select-test-questions/index.ts` — add source_year filter
- `supabase/functions/generate-hint/index.ts` — align field names
- `index.html` — ensure overlay-root div
- New migration — seed 500+ questions

