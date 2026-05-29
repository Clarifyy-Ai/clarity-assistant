# Live Co-pilot Production Fixes — Plan

Per your guardrails: investigate first, fix component-by-component, do not touch unrelated working features. Below is what I found and a tightly scoped fix plan for each of the 4 issues. Nothing has been changed yet.

---

## Issue 1 — Chat only generates a single answer, slow response

**Findings (`src/hooks/useLiveCopilot.ts`)**
- Every new chat call runs `abortRef.current?.abort()` (line 404), which is the *same* AbortController shared with the auto-hint pipeline. So sending a 2nd chat message aborts the 1st mid-stream, and any in-flight hint cancels chat too. That looks to the user like "only one answer ever finishes".
- `submitManualQuestion` calls `routeHint(...)` with `answerMode` not pinned — chat uses the same hint router, which streams a short hint and stops. There's no separate `chatAbortRef`.
- Slow response: `routeHint` → server round-trip + Gemini cold start. There's no streaming flush throttle issue, but `setChatGenerating(true)` is set *after* the abort, adding a render delay. Also no optimistic "thinking…" bubble.

**Fix (scoped to `useLiveCopilot.ts` only)**
1. Add a dedicated `chatAbortRef` separate from `abortRef` so chat and auto-hint don't cancel each other.
2. Push the user message + an empty assistant placeholder into chat history *before* the await so the UI feels instant.
3. Always set `answerMode: "chat"` (or keep "hint" but stop sharing the abort controller).
4. Wrap in try/finally to guarantee `setChatGenerating(false)`.

No changes to stores, edge functions, or other hooks.

---

## Issue 2 — System voice not read, only mic

**Findings**
- `useAudioSession.ts` line 104–134 correctly requests tab audio via `captureSystemAudio()` when `enableSystemAudio` is true, merges streams, and feeds Deepgram.
- BUT `OverlayQuickStart.tsx:80` starts the live session with `enable_system_audio: false`. Other entry points (LiveOverlay, LiveRehearsal, MockInterview, wizards) pass `true`. If the user enters via Quick Start, the system stream is never requested → only mic is transcribed.
- Even when `true`, `captureSystemAudioViaTabShare` requires the user to tick **"Share tab audio"** in Chrome's picker. If they miss it, we fall back to mic-only with a toast — but the toast may be missed.

**Fix (scoped, no logic changes to capture pipeline)**
1. Flip `OverlayQuickStart.tsx:80` to `enable_system_audio: true` so the Quick Start path matches the other entry points.
2. In `useAudioSession.ts`, after the tab-share confirm dialog, if the returned stream has 0 audio tracks (user didn't tick "Share audio"), show a **persistent banner** (not just a toast) via `streamError` with code `SYSTEM_AUDIO_MISSING_CHECKBOX` so the user can retry from the toolbar.

I will NOT change `tabAudioCapture.ts`, `systemAudioCapture.ts`, or Deepgram wiring — they already work.

---

## Issue 3 — Exam papers being scraped by AI, must use Edge function

**Findings**
- Edge function `supabase/functions/collect-exam-papers/index.ts` already exists (227 lines) and is the correct scraping path (allowlisted official portals: NTA, UPSC, SSC).
- It IS already wired in `src/pages/app/admin/AdminSeedQuestions.tsx:177` via `fetchEdgeJson("collect-exam-papers", ...)`.
- The "AI" path you're seeing is most likely **`parse-question-pdf`** (line 70 of `supabase/functions/parse-question-pdf/index.ts`) — that's Gemini extracting MCQs from an *already-downloaded* PDF, which is a different stage (parsing, not scraping). And the AI gap-fill in `select-test-questions` runs only when scraped questions are insufficient.

**Question for you (need confirmation before changing)**
- **Where exactly are you seeing AI used for scraping?** Options:
  - (a) The "AI Gap-Fill" badge on mock test launch — that's *fallback* generation, not scraping. Should I disable it and hard-fail instead, forcing admins to run `collect-exam-papers` first?
  - (b) An admin flow that calls Gemini directly to "fetch" papers (I didn't find this — please point me at the page).
  - (c) The PDF parser (`parse-question-pdf`) — that is scraping *from* a PDF, but it's not web scraping. Should it be replaced with a non-AI parser?

I will not touch `collect-exam-papers` or `parse-question-pdf` until you confirm which path is wrong.

---

## Issue 4 — Overlay not production-ready

This is broad. Per your "component-by-component" rule, I'd rather not do a sweeping overlay rewrite. From prior audits the known overlay gaps are:
- Cramped layout at < 1100px
- No persistent error banner for missing tab audio (covered in Issue 2)
- Chat input loses focus on stream commit
- No "stop generating" button (only abort happens on next send)

**Proposal:** I'll ship Issues 1–3 first. Then for the overlay, please tell me **which single sub-issue to tackle next** (layout, stop button, focus, error banner, etc.) so I can do it surgically without touching unrelated overlay code.

---

## Files I will touch (only after you approve)

For Issues 1 + 2:
- `src/hooks/useLiveCopilot.ts` — add `chatAbortRef`, optimistic chat bubble, try/finally
- `src/components/overlay/OverlayQuickStart.tsx` — flip `enable_system_audio` to `true`
- `src/hooks/useAudioSession.ts` — persistent banner when "Share audio" unchecked

For Issue 3: waiting on your answer (a/b/c).

For Issue 4: waiting on which sub-issue.

**Nothing else will be modified.** No store changes, no edge function changes, no type changes, no migration.

Approve to proceed with Issues 1 + 2, and answer the Issue 3 question.
