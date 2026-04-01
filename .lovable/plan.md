

# Fix Plan: Mock Test Questions Not Showing + Edge Function Errors

## Root Causes

1. **exam_type mismatch** — The frontend uses uppercase IDs like `JEE_MAIN`, `NEET`, `SSC_CGL`, but the database has human-readable values: `JEE Main`, `NEET UG`, `SSC CGL`, `UPSC CSE`, `IBPS PO`. The `select-test-questions` edge function queries `.eq("exam_type", "JEE_MAIN")` which returns zero results.

2. **exam_papers table is empty** — No rows exist in `exam_papers`, so ExamPapers page always shows nothing.

3. **CORS missing `x-app-name`** — The Supabase client sends `x-app-name: clarify-ai` as a global header, but `_shared/cors.ts` doesn't include it in `Access-Control-Allow-Headers`, causing CORS preflight failures on every `supabase.functions.invoke()` call.

4. **`ping` edge function doesn't exist** — The network monitor probes `/functions/v1/ping` every 10 seconds, generating constant 404/CORS errors in the console.

## Plan

### Step 1: Fix CORS headers
Add `x-app-name` and `x-app-version` to the allowed headers in `supabase/functions/_shared/cors.ts`. This fixes ALL edge function CORS errors in one shot.

### Step 2: Create `ping` edge function
A minimal function that returns `{ ok: true }` to stop the network monitor's constant 404 errors.

### Step 3: Add exam_type mapping
Create a mapping in both the frontend and the `select-test-questions` edge function that converts frontend IDs to database values:
- `JEE_MAIN` → `JEE Main`
- `NEET` → `NEET UG`
- `SSC_CGL` → `SSC CGL`
- `UPSC` → `UPSC CSE`
- `IBPS_PO` → `IBPS PO`

Files to update:
- `supabase/functions/select-test-questions/index.ts` — map `config.exam_type` before querying
- `src/pages/app/mock-test/ExamPapers.tsx` — map `examType` param before querying `exam_papers` and `questions`
- `src/pages/app/mock-test/TestConfigure.tsx` — map exam_type in config before sending to edge function

### Step 4: Seed exam_papers table
Insert rows for the exam types that have questions (JEE Main, NEET UG, SSC CGL, UPSC CSE, IBPS PO) so the ExamPapers page has data to display. Use a database migration.

### Step 5: Redeploy edge functions
Deploy `ping`, `select-test-questions`, and all functions using `_shared/cors.ts`.

## What This Fixes
- Mock test "Start Test" → questions are found and loaded
- ExamPapers page → shows available papers
- All edge function CORS errors → eliminated
- Console spam from network monitor → stopped

