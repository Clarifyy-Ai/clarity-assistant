

# Fix Plan: Mock Test, Company Research, and Core Issues

## Root Causes Identified

### 1. CRITICAL: Difficulty case mismatch (Mock Test returns 0 questions)
The database stores difficulty as `Easy`, `Medium`, `Hard` (title case), but the `select-test-questions` edge function checks for `EASY`, `MEDIUM`, `HARD` (uppercase) on line 240. Result: **every question falls into the default "MEDIUM" bucket**, breaking difficulty distribution, and if the pool is small, questions are missed entirely.

### 2. Subject name mismatches
Frontend `EXAM_SUBJECTS` for SSC_CGL and IBPS_PO already match the DB (`Quant`, `GK`, `Reasoning`, etc.) — this was fixed previously. UPSC subjects also match. **No change needed here.**

### 3. Missing exam types in frontend
DB has `HPCL Engineer` (170 questions) and `PSU` (142 questions) but the frontend `EXAM_TYPES` and `EXAM_SUBJECTS` lists don't include them. Users who uploaded these questions can't create tests for them.

### 4. CompanyResearch uses `useState` instead of `useEffect`
`CompanyResearch.tsx` line 38: `useState(() => { ... })` is used to fetch saved briefs. This runs the side effect as a state initializer (synchronously, once), which is incorrect for async operations and won't re-run when `user` changes.

### 5. CompanyProfile references non-existent column `brief_data`
`CompanyProfile.tsx` line 55 reads `cached.brief_data` and line 73 upserts `brief_data`, but the `company_research` table has no `brief_data` column. It has `raw_data` (jsonb). This causes the cache check to always miss and the upsert to fail silently.

### 6. `examTypeMap.ts` missing HPCL/PSU entries
The shared mapping doesn't know about `HPCL_ENGINEER` or `PSU` exam types.

---

## Plan

### Step 1: Fix difficulty case mismatch in edge function
In `supabase/functions/select-test-questions/index.ts`, normalize the difficulty comparison to be case-insensitive:
- Line 240: Change `["EASY", "MEDIUM", "HARD"].includes(q.difficulty)` to `["EASY", "MEDIUM", "HARD"].includes(String(q.difficulty).toUpperCase())`
- Use `.toUpperCase()` on `q.difficulty` before bucketing

This single fix will make all 1500+ questions findable by difficulty distribution.

### Step 2: Add HPCL Engineer and PSU to frontend exam types
Update `MockTestHub.tsx` `EXAM_TYPES` array and `TestConfigure.tsx` `EXAM_SUBJECTS` / `EXAM_TOPICS` to include:
- `HPCL_ENGINEER` → subjects: Civil Engineering, English, Quantitative Aptitude, Reasoning
- `PSU` → subjects: Domain Knowledge, English Language, Intellectual Potential Test, Quantitative Aptitude

Also add these to `examTypeMap.ts`:
- `HPCL_ENGINEER` → `HPCL Engineer`
- `PSU` → `PSU`

### Step 3: Fix CompanyResearch.tsx — useState → useEffect
Change line 38 from `useState(() => { ... })` to `useEffect(() => { ... }, [user?.id])` so saved briefs load correctly.

### Step 4: Fix CompanyProfile.tsx — brief_data → raw_data
- Line 55: `cached.brief_data` → `cached.raw_data`
- Line 73-78: Change upsert to use `raw_data` instead of `brief_data`, and map `overview`, `culture`, `prep_tips` to their proper columns

### Step 5: Redeploy select-test-questions edge function
Deploy updated edge function with the difficulty fix.

---

## What This Fixes
- **Mock test "no questions found"** → 1500+ questions now correctly bucketed by difficulty
- **HPCL/PSU exams** → visible in test hub, configurable
- **Company Research page** → saved briefs load properly
- **Company Profile** → cache works, upsert succeeds
- **All edge function CORS** → already fixed in prior session

## Files Modified
- `supabase/functions/select-test-questions/index.ts` (difficulty normalization)
- `supabase/functions/_shared/examTypeMap.ts` (add HPCL_ENGINEER, PSU)
- `src/pages/app/mock-test/MockTestHub.tsx` (add exam type cards)
- `src/pages/app/mock-test/TestConfigure.tsx` (add subjects/topics for new exams)
- `src/pages/app/company-research/CompanyResearch.tsx` (useState → useEffect)
- `src/pages/app/company-research/CompanyProfile.tsx` (brief_data → raw_data)

