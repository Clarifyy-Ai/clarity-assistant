

# Fix Plan: Edge Functions, Resume Parsing, and Database Mismatches

## Root Causes Identified

1. **All edge functions were NOT deployed** — this caused the "Failed to send a request to the Edge Function" error. I've already deployed all 22 edge functions during investigation.

2. **`resume_versions` table does not exist** — the `parse-resume` edge function references it, but only `resumes` and `documents` tables exist in the database.

3. **Onboarding resume upload uses wrong table schema** — `OnboardingStep5ResumeUpload.tsx` inserts into `resumes` table with columns that don't match (`file_name`, `file_url`, `file_size`, `is_active` don't exist on `resumes`; actual columns are `name`, `file_path`, `url`, `content`, `is_primary`).

4. **`resumes` storage bucket is private** — the `parse-resume` edge function tries to fetch the file via public URL, but the bucket is not public, so the download fails.

5. **`onboarding_complete` column doesn't exist** — it's actually `onboarding_completed`, so completing onboarding silently fails.

6. **`ResumeDetail.tsx` reads from `documents` table** — separate from the `resumes` table used in onboarding. Two different resume systems exist.

7. **Gemini model mismatch** — `_shared/gemini.ts` uses `gemini-1.5-flash`, but `parse-resume` uses `gemini-2.0-flash`. Free tier supports `gemini-2.0-flash` so we should standardize on that.

## Plan

### Step 1: Create `resume_versions` table
Create the missing table that `parse-resume` edge function depends on, with columns: `id`, `resume_id` (FK to resumes), `parsed_data` (jsonb), `parse_status` (text), `parse_error` (text), `created_at`.

### Step 2: Fix `resumes` table column usage in frontend
Update `OnboardingStep5ResumeUpload.tsx` to use actual `resumes` table columns:
- `file_name` → `name`
- `file_url` → `url`  
- `file_size` → remove (column doesn't exist)
- `is_active` → `is_primary`

### Step 3: Fix `parse-resume` edge function
Update to handle the actual `resumes` table schema. The edge function currently:
- Validates against `resumes.user_id` (correct)
- Uses `resume_versions` for status tracking → will work after Step 1
- Downloads file via public URL → fix to use Supabase Storage service role download instead, since bucket is private

### Step 4: Fix `onboarding_complete` → `onboarding_completed`
In `OnboardingStep5ResumeUpload.tsx`, change the profile update to use the correct column name.

### Step 5: Update `_shared/gemini.ts` model
Change from `gemini-1.5-flash` to `gemini-2.0-flash` to match the free tier and be consistent with `parse-resume`.

### Step 6: Redeploy affected edge functions
Deploy `parse-resume`, `select-test-questions`, and any functions using `_shared/gemini.ts`.

### Step 7: Add OCR_API_KEY secret
The user says they added it but it's not in project secrets. Will prompt to add it.

## What This Fixes
- Mock test "Start Test" button → works (functions deployed)
- Resume upload + AI parsing → works (schema aligned, private bucket handled)
- Onboarding completion → works (correct column name)
- AI features using Gemini → works (correct model for free tier)

## Technical Details
- Database migration: 1 new table (`resume_versions`)
- Files modified: `OnboardingStep5ResumeUpload.tsx`, `supabase/functions/parse-resume/index.ts`, `supabase/functions/_shared/gemini.ts`
- Edge functions redeployed: all 22 already done, will redeploy changed ones after edits

