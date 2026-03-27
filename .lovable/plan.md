

# Mock Test Engine Overhaul — Implementation Plan

This plan addresses all 6 prompts from the QA report: Excel import, level selection, test layout rebuild, session loading fix, question collection pipeline, and auto-test creation.

---

## Scope & Priority

The work is organized into 3 tiers based on impact and dependency:

**Tier 1 — Fix broken features (Prompts 1, 3, 4)**
- Session history loading error
- Excel import system for questions  
- Test session layout rebuild

**Tier 2 — New UX features (Prompts 2, 6)**
- Level selection + smart shuffle before test start
- Auto-test catalog from collected papers

**Tier 3 — Admin pipeline (Prompt 5)**
- Question collection pipeline (admin seeding, AI gap-fill)

---

## Prompt 4: Fix Session Loading Error

**Root cause**: Dashboard's `RecentSessions` queries `target_company` column which does not exist on the `sessions` table. The column is `title`. SessionHistory page query looks correct (uses `title`), but Dashboard query uses a non-existent column causing the error toast.

**Fix**:
- `src/pages/app/Dashboard.tsx` line 320: change `target_company` to `title` in the select query
- Line 378: change `s.target_company` to `s.title` in the display

---

## Prompt 1: Excel Import System

**Approach**: Add an "Excel Import" tab to `UploadQuestions.tsx` as the primary import method. Use the `xlsx` (SheetJS) library for client-side parsing — no edge function needed.

**Files**:

1. **Install `xlsx` package** via `package.json`

2. **Generate downloadable template** (`/tmp/generate_template.py` script):
   - Sheet 1: "Questions" with 16 column headers + 3 sample rows
   - Sheet 2: "Instructions" with field-by-field guidance
   - Output to `public/ClarifyAI_Question_Template.xlsx`

3. **New component `ExcelImportTab`** inside `UploadQuestions.tsx`:
   - Download Template button
   - Drag-and-drop zone for `.xlsx`/`.xls` (5MB limit)
   - Client-side parsing with `xlsx` library: read Sheet 1 from row 2, validate mandatory fields (`Question_Text`, `Correct_Answer`)
   - Preview table showing parsed questions with inline edit
   - Error log for skipped rows
   - "Save to Question Bank" button — bulk insert to Supabase `questions` table
   - Map Excel columns to DB: `Question_Number` → row order, `Question_Text` → `question_text`, `Option_A-D` → `options` JSONB array, `Correct_Answer` → `correct_answer`, etc.

4. **Update tab default**: Make "Excel Import" the first/default tab, "PDF Import" second with "(Beta)" label

---

## Prompt 3: Test Session Layout Rebuild

**Current state**: `TestSession.tsx` (819 lines) already has a functional 3-panel layout with question navigator, timer, LaTeX rendering, and 5-state question tracking. It works but needs polish.

**Changes to `TestSession.tsx`**:

1. **Left Panel (220px)**: Already has question grid — add subject tab filtering, section-wise answered counts, and color legend
2. **Center Panel**: Already has question text + options as clickable cards — improve sizing to 18px font, add "Clear Response" / "Mark for Review & Next" / "Save & Next" button row
3. **Right Panel (280px)**: Already has timer + submit — add live score display, answered/unanswered/marked/not-visited counts, pause button
4. **Confirmation Modal**: Already exists (`showSubmitModal` state) — enhance with unanswered count warning
5. **Auto-submit**: Already implemented (timer hits 0 → `handleSubmit(true)`)
6. **Mobile layout**: Hide left panel behind floating "Questions" drawer button, collapse right panel to top bar (timer + score only), full-width center panel

---

## Prompt 2: Level Selection + Smart Question Shuffling

**Current state**: `TestConfigure.tsx` already has difficulty distribution sliders, subject/topic selection, question count, and duration. The `select-test-questions` edge function already does adaptive selection based on user performance history.

**Changes**:

1. **Add difficulty level presets** to `TestConfigure.tsx`:
   - 4 preset cards: BEGINNER (70/20/10), INTERMEDIATE (20/60/20), ADVANCED (10/30/60), ADAPTIVE
   - Clicking a preset auto-sets the difficulty distribution sliders
   - ADAPTIVE mode: edge function already handles this via `user_topic_performance` table

2. **Add option shuffle toggle** to config and pass to `create-test`:
   - New `shuffle_options: boolean` field in config
   - In `TestSession.tsx`, when loading questions and `shuffle_options` is true, randomize the order of `options` array for each MCQ and remap `correct_answer` accordingly

3. **Add step indicator**: Show 3 steps — Choose Level → Settings → Confirm & Start
   - Step 3 shows summary: "30 questions | 45 minutes | Intermediate | Physics + Chemistry"

4. **Question count presets**: Add quick-select buttons (10/20/30/50/Full Paper) alongside the slider

5. **Time limit presets**: Add quick-select buttons (10/20/30/60/No limit)

---

## Prompt 6: Auto-Test Catalog (Exam Papers)

**Current state**: `ExamPapers.tsx` exists (235 lines) and queries an `exam_papers` table. This table may not exist yet.

**Changes**:

1. **Database migration**: Create `exam_papers` table if not exists:
   - `id`, `exam_type`, `exam_name`, `year`, `session`, `shift`, `total_questions`, `total_marks`, `duration_minutes`, `difficulty_level`, `question_ids` (uuid[]), `is_official` (bool), `avg_score` (numeric), `attempt_count` (int), `created_at`
   - RLS: SELECT for all authenticated users, INSERT/UPDATE for admins

2. **Rebuild `ExamPapers.tsx`** as a browsable catalog:
   - Filter bar: Exam Type, Year, Subject, Difficulty, Duration
   - Test cards: exam name + year + shift, question count, marks, time, subject breakdown chips, average score, difficulty meter
   - Two buttons per card: "Practice Mode" (no timer) and "Exam Mode" (official settings)
   - "Attempted" badge for completed papers

3. **One-click launch**: 
   - Exam Mode: auto-apply official exam settings (JEE Main: 90q/180min/+4-1, NEET: 180q/200min, etc.)
   - Skip configure page, go straight to test session

4. **Practice Mode**:
   - No timer, show answer + explanation after each question
   - Self-assessment buttons: "I knew this" / "I guessed" / "I didn't know"

5. **Progress tracker per exam type**: Papers attempted count, average score, best performance, most improved topic

---

## Prompt 5: Question Collection Pipeline (Admin)

**Changes**:

1. **Admin "Seed Questions" page** (`/app/admin/seed-questions`):
   - Upload official exam PDFs → parse via existing `parse-question-pdf` edge function
   - Bulk Excel import using the same `ExcelImportTab` component
   - Tag questions with `source: "OFFICIAL_PYP"`, `is_verified: true`, `source_paper`

2. **AI Gap-Fill**: 
   - Query `questions` table grouped by topic + exam_type
   - For topics with < 15 questions, auto-generate via `select-test-questions`'s existing `generateThinTopicQuestions` function
   - Tag as `source: "AI_GENERATED"`, `is_verified: false`

3. **Question Bank Status Dashboard** (admin view):
   - Table: exam type, total questions, years covered, subjects, verified vs AI ratio, last updated
   - "Add More" button per exam type

---

## Database Changes

1. **Create `exam_papers` table** (for Prompt 6)
2. **No changes needed** for sessions, questions, mock_tests — schemas already correct

## File Changes Summary

| File | Change |
|---|---|
| `src/pages/app/Dashboard.tsx` | Fix `target_company` → `title` |
| `src/pages/app/mock-test/UploadQuestions.tsx` | Add Excel import tab with SheetJS parsing |
| `src/pages/app/mock-test/TestSession.tsx` | Polish 3-panel layout, mobile responsive, option shuffle |
| `src/pages/app/mock-test/TestConfigure.tsx` | Add level presets, step indicator, shuffle toggle |
| `src/pages/app/mock-test/ExamPapers.tsx` | Rebuild as browsable catalog with practice/exam modes |
| `src/pages/app/admin/AdminSeedQuestions.tsx` | New admin page for question seeding |
| `src/App.tsx` | Add route for admin seed page |
| `public/ClarifyAI_Question_Template.xlsx` | Generated template file |
| `supabase/migrations/` | Create `exam_papers` table |
| `package.json` | Add `xlsx` dependency |

