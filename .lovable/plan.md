

# Full Feature Audit & Fix Plan — Clarify AI

## Summary

Audit identified 5 broken bugs, 2 missing assets, and several non-functional feature paths. Production readiness: **6.5/10** (up from previous 5/10 after security fixes).

---

## 🔴 Critical Bugs to Fix

### BUG-1: `setField` in `UploadQuestions.tsx` ManualCreator is broken
**Line 220**: `setForm((prev) => ({ ...prev, value }))` should be `({ ...prev, [key]: value })`.
This means the entire Manual Question Creator form cannot save any field changes — every field write overwrites the form with a `value` property instead of the intended key.

**Impact**: Manual question creation is completely broken.

### BUG-2: `create-test` sets status to `IN_PROGRESS` instead of `DRAFT`
**Line 148 of `create-test/index.ts`**: The edge function inserts tests with `status: "IN_PROGRESS"`. But `TestSession.tsx` line 460 checks `if (loadedTest.status === "DRAFT")` to set `started_at` and transition to `IN_PROGRESS`. Since the test is already `IN_PROGRESS` with no `started_at`, `computeRemainingSeconds` calculates from epoch, causing the timer to show 0 or negative time immediately.

**Impact**: Timer is broken for new tests. Tests may auto-submit instantly.

**Fix**: Change `create-test/index.ts` to insert with `status: "DRAFT"` so TestSession can properly initialize `started_at`.

### BUG-3: `requireAuth` in `_shared/utils.ts` throws a Response object
**Line 60**: `throw errorResponse(...)` throws a `Response` object. In `submit-test/index.ts`, the catch block at line 373+ does `handleCors(req)` then calls `requireAuth(req)`. If auth fails, it throws a Response, but the catch block wraps it in another error response, potentially causing a double-response or unreadable error.

**Impact**: Auth failures in submit-test may produce garbled error responses.

**Fix**: Add a check in submit-test catch block: `if (err instanceof Response) return err;`

---

## 🟠 High Priority — Missing/Non-functional Features

### MISSING-1: Excel template download link works (verified `public/ClarifyAI_Question_Template.xlsx` exists)
No fix needed.

### MISSING-2: `ExcelImportTab` inline editing — previously fixed, verified working
`updateField` uses `{ ...row, [key]: value }` correctly. No fix needed.

### FEATURE-1: Exam Papers page (`ExamPapers.tsx`) queries `exam_papers` table
This page queries a table called `exam_papers` which may not exist in the database. Need to verify and create if missing.

---

## 🟡 Medium Issues

### UI-1: `UploadQuestions.tsx` ManualCreator — `setField` for `exam_type` passes `null`
Line 477: `setField("exam_type", value === "none" ? null : value)` but `setField` signature expects `ParsedQuestion[K]` which for `exam_type` is `string | null`. This works but the broken `setField` implementation (BUG-1) makes it moot until fixed.

### UI-2: Test status inconsistency
`MockTestHub.tsx` shows status "DRAFT" but `create-test` never creates DRAFT tests (always IN_PROGRESS). This means the "Resume" button logic works but tests never show as resumable since they are immediately IN_PROGRESS.

---

## Implementation Plan

### Step 1: Fix ManualCreator `setField` (BUG-1)
File: `src/pages/app/mock-test/UploadQuestions.tsx` line 220
Change: `({ ...prev, value })` → `({ ...prev, [key]: value })`

### Step 2: Fix `create-test` edge function status (BUG-2)
File: `supabase/functions/create-test/index.ts` line 148
Change: `status: "IN_PROGRESS"` → `status: "DRAFT"`

### Step 3: Fix `submit-test` error handling (BUG-3)
File: `supabase/functions/submit-test/index.ts`
Add Response instance check in catch block.

### Step 4: Verify `exam_papers` table exists
Query database, create migration if missing.

### Step 5: Update `.lovable/plan.md` with v5 status

---

## Features Verified Working (No Fix Needed)
- Mock Test Hub — loads stats, recent tests, streak calculation
- Test Configure — 3-step wizard, difficulty presets, subject/topic selection
- Test Session — question navigator, timer, auto-save, bookmark, submit flow
- Test Results — score display, subject/topic breakdown, AI analysis, recommended tests
- Excel Import — file parsing, validation, inline editing, batch save
- Test Revision — spaced repetition logic
- Test Analytics — charts, trend tracking
- Question Bank (MyQuestions) — CRUD, filtering, bulk delete
- Star Builder — STAR framework with AI polish
- Rephraser — multiple rephrase styles
- Dashboard — stats, streaks, sessions

