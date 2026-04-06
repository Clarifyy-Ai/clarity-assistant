

# Fix Clarify AI — Overlay, AI Answers, Audio & New Features

## Root Cause Analysis

### BUG-1: AI answers never appear (CRITICAL)
**File**: `src/lib/ai/geminiClient.ts` line 76
**Issue**: `data.hint` reads a non-existent property. The `generate-hint` edge function returns `{ hints: "..." }` (plural), but the client reads `data.hint` (singular). Result: hint is always `""`, so nothing appears in the overlay.
**Fix**: Change `data.hint` to `data.hints`.

### BUG-2: No DEEPGRAM_API_KEY secret configured (CRITICAL)
**Issue**: The `deepgram-token` edge function checks `Deno.env.get("DEEPGRAM_API_KEY")` and returns 503 if missing. The project secrets list shows no `DEEPGRAM_API_KEY`. Without this, the Deepgram WebSocket cannot connect, so there is no transcription, no question detection, and no auto-generated hints.
**Fix**: User must add their Deepgram API key as a secret. The code itself is correct.

### BUG-3: Overlay renders in PiP by default, breaking layout
**File**: `src/components/overlay/OverlayWindow.tsx` line 95
**Issue**: `useDocumentPiP(is_visible)` attempts to open a Document Picture-in-Picture window whenever the overlay is visible. If the browser blocks the PiP request (common in non-Chrome or when not triggered by user gesture), `pipDoc` is null and the overlay falls back to `document.body`, but styles may not transfer correctly. Additionally, PiP windows cannot be styled or debugged easily.
**Fix**: Disable PiP by default. Use inline rendering in the main document via `createPortal` to `overlay-root`. Keep PiP as an opt-in toggle.

## Implementation Plan

### Step 1: Fix AI hint property name mismatch (BUG-1)
- `src/lib/ai/geminiClient.ts` line 76: `data.hint` → `data.hints`

### Step 2: Disable PiP by default, fix overlay rendering (BUG-3)
- `src/components/overlay/OverlayWindow.tsx`: Change `useDocumentPiP(is_visible)` to `useDocumentPiP(false)` so the overlay always renders inline in the main page portal.
- This immediately fixes the "overlay doesn't appear" and "layout is broken" issues.

### Step 3: Add DEEPGRAM_API_KEY secret requirement (BUG-2)
- Use the `add_secret` tool to prompt the user to add their Deepgram API key.
- Add a visible warning in the overlay when Deepgram connection fails, with a message about configuring the API key.

### Step 4: Improve the Connect step in PreSessionSetupWizard
Reference: ParakeetAI's "Connect" dialog (image-3, image-5)
- Add platform icons (Zoom, Google Meet, Teams, HackerRank, CodeSignal) to step 6.
- Add "Share tab audio" instruction callout.
- Add "Browser vs Desktop" info section.
- Keep the existing mic permission check flow.

### Step 5: Build inline session layout (ParakeetAI-style)
Reference: ParakeetAI's in-browser session view (image-3)
- Restructure `LiveRehearsal.tsx` to show a 2-panel layout:
  - **Left panel**: Transcript stream with Connect/Clear buttons, auto-scroll toggle
  - **Right panel**: AI Answer stream with "AI Answer" CTA button
- Add a top bar with: brand logo, session timer, language selector, settings gear, Exit button
- The floating overlay remains available via hotkey but is no longer the primary UI.

### Step 6: Build Session List page
Reference: ParakeetAI's "Call Sessions" (image-2, image-5)
- Create `src/pages/app/sessions/SessionList.tsx` with a table layout:
  - Columns: Title, Description, Mode, Ends In, AI Usage, Created At, Actions
  - Row actions: View details, Edit, Delete
  - "Start Free Session" and "Start Session" buttons in top bar
  - Pagination support
- Query `sessions` table from Supabase.
- Add route `/app/sessions` pointing to this page.

### Step 7: Update sidebar navigation
- Rename "Sessions" / "Session History" to "Call Sessions" (matching ParakeetAI terminology).
- Add icons matching the reference.

## Technical Notes
- No database migrations needed — `sessions` table already exists.
- No new edge functions needed — existing `generate-hint` and `deepgram-token` are sufficient once bugs are fixed.
- The DEEPGRAM_API_KEY is the only blocker for live transcription. Without it, the overlay will show AI answers via manual chat only.

## Estimated Changes
- ~8 files modified
- ~2 new files created
- 0 migrations

