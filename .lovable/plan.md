# Gov Exam Mock Tests → Testbook-style Flow

## Audit findings (root causes)

1. **"No questions" on most gov papers** — `exam_papers` has 33 gov rows (UPSC, SSC CGL, IBPS PO, JEE, NEET) but `questions` only has PYQs for a few years:
   - SSC CGL → only 2019 (91 Qs). Papers for 2020–2025 all hard-fail.
   - IBPS PO → only 2021. UPSC → only 2020/2021.
   - `select-test-questions` correctly returns `"Question bank is short by N"` because **AI gap-fill is policy-disabled** (intentional).
   - So the user-visible bug is **UX, not data**: paper cards launch even when 0 questions exist for that year, then crash.

2. **"Collect from source" admin scraper crashes** — `supabase/functions/collect-exam-papers/index.ts` references `totalImported` on lines 246/254 but the variable is **never declared** → ReferenceError on every run. (Gov sites also block scraping anyway — the user is replacing this with their own FastAPI scraper.)

3. **Exam Papers list "empty"** — only appears empty for exams the user clicks where bank is empty. The exam_papers rows themselves are present and the query is correct.

4. **Testbook-like UX gap** — `TestSession.tsx` (1420 lines) already has question palette + mark-for-review + section timer + solutions in `TestResults.tsx`. Mostly there; just needs the "instant start, only ready papers" front door.

---

## Plan (4 components, isolated)

### Component 1 — Exam Papers UI: "only show ready papers" (frontend only)
**File:** `src/pages/app/mock-test/ExamPapers.tsx`
- Replace the `QUESTIONS_MAX_YEAR = 2025` hardcoded gate with the **actual** `questionCounts[paper.id]` value already loaded.
- If `questionCounts[paper.id] === 0`:
  - Show a "Coming soon — questions not yet imported" badge.
  - Disable both **Practice** and **Exam Mode** buttons (no toast spam, no failed launches).
- If `0 < count < paper.total_questions`: show "Partial — N of M questions ready" badge but allow launch.
- Add a top-bar toggle: **"Show only ready papers"** (default ON for gov exams) so users browsing UPSC/SSC see a clean Testbook-style ready list.
- **Guardrail:** no changes to `launchMockTest()`, `TestSession`, `TestResults`, or any DB schema.

### Component 2 — Fix the broken admin scraper (edge function only)
**File:** `supabase/functions/collect-exam-papers/index.ts`
- Declare `let totalImported = 0;` before the for-loop (one-line fix for the ReferenceError).
- Add a clear warning to the response when gov sites return 0 PDFs (most do — they block bots): `"Government portals block automated scraping. Use the FastAPI ingest endpoint or Excel upload instead."`
- **Guardrail:** allowlist, admin gate, Gemini parsing, and existing import logic untouched.

### Component 3 — New `bulk-import-questions` edge function for the FastAPI scraper
**New file:** `supabase/functions/bulk-import-questions/index.ts`
- POST endpoint that accepts:
  ```json
  {
    "exam_type": "SSC CGL",
    "source_year": 2024,
    "paper": { "exam_name": "SSC CGL Tier 1", "session": "Sep", "shift": "1", "total_questions": 100, "duration_minutes": 60 },
    "questions": [
      { "question_text": "...", "options": [{"label":"A","text":"..."}, ...], "correct_answer": "B",
        "explanation": "...", "subject": "Quant", "topic": "Algebra", "difficulty": "MEDIUM",
        "image_url": "https://...", "latex_present": false }
    ]
  }
  ```
- Auth: requires a header `x-ingest-key` matching a new `INGEST_API_KEY` secret (so the user's FastAPI service can authenticate without a user JWT).
- Uses service-role client → bypasses RLS, inserts into `questions` with `is_public=true, is_verified=true, source='Previous Year Paper'`, and upserts `exam_papers` for the year.
- Returns `{ paper_id, inserted_count, skipped_count }`.
- **Guardrail:** does not touch existing tables' schema, RLS, or any user-facing code paths.
- After deploy I'll ask the user to add the `INGEST_API_KEY` secret.

### Component 4 — Document the schema for the FastAPI scraper
**New file:** `docs/FASTAPI_INGEST.md`
- Exact column list for `questions` and `exam_papers`.
- Example `requests.post(...)` snippet hitting the new edge function.
- Image-upload guidance (use the public `question-images` bucket, return public URL as `image_url`).
- Naming conventions: `exam_type` values must match the canonical labels (`"SSC Exams (CGL/CHSL)"`, `"Banking (IBPS/SBI/RBI)"`, etc.) — list provided.
- **Guardrail:** docs-only, no code or DB change.

---

## Out of scope (explicit guardrails)
- No changes to `TestSession.tsx`, `TestResults.tsx`, timer logic, palette UI, scoring, or analytics.
- No changes to `launchMockTest`, `select-test-questions` core selection logic, or credit/free-plan limits.
- No schema migrations (existing `questions`/`exam_papers` already fit the Testbook model).
- No re-enabling of AI gap-fill (stays disabled per existing policy).

---

## What you do separately
Build the FastAPI scraper to:
1. Download PDFs/images for the past papers you target.
2. Extract MCQs + diagrams.
3. POST to `https://<project>.functions.supabase.co/bulk-import-questions` with `x-ingest-key` header.

Once data is imported, the Exam Papers page (Component 1) will automatically show those papers as ready and they'll launch instantly with real PYQs in the existing Testbook-style player.

Approve and I'll implement Components 1 → 4 in order.
