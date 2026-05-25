# Mock Test & Documents Production Audit — 2026-05-25

## Summary

Gov exam mock tests failed mainly because **exam papers existed without matching questions** in the bank. Cover letter PDFs in Documents did not parse or feed interview AI. Equation/diagram images needed URL normalization and LaTeX rendering.

## Root causes

| Issue | Cause | Fix |
|-------|--------|-----|
| "Generation failed" / no questions | Empty `questions` for paper year/exam; `select-test-questions` returned 0 IDs | Shared `launchMockTest()` with AI gap-fill; starter seed migration; bank count badges on papers |
| Can't scrape all govt sites | Legal/ops — not in-app scraping | Admin Seed Question Bank (PDF/CSV), AI gap-fill (`GEMINI_API_KEY`, `SYSTEM_USER_ID`) |
| Equation images missing | Relative storage paths, Drive/Dropbox links | `resolveQuestionImageUrl`, `QuestionImage`, `MathText` LaTeX `\( \)` / `\[ \]` |
| Cover letter PDF not parsed | Stub UI; no `parse-document` edge | `uploadCoverLetter` + `parse-document` → `documents.content` / `parsed_summary` |
| Interview AI ignored cover letter | Not merged into context | `loadPrimaryCoverLetterText`, `buildResumeContextForAI`, live copilot + orchestrator |

## Deploy checklist

1. `npx supabase db push` — includes `20260525160000_seed_starter_mock_questions.sql`, `20260525161000_storage_documents_bucket.sql`
2. Deploy edge functions: `select-test-questions`, `create-test`, `parse-document`, `parse-question-pdf` (if updated)
3. Supabase secrets: `GEMINI_API_KEY`, `SYSTEM_USER_ID` (UUID of system profile for AI-generated questions)
4. Ensure storage bucket `documents` exists (migration creates it)
5. `npm run build` and smoke test:
   - Exam Papers → JEE Main 2024 → Exam Mode
   - Question with `$...$` and `image_url`
   - Documents → Cover Letter PDF → verify parsed summary → Live interview hints mention letter content

## Files touched

- `src/lib/mock-test/launchMockTest.ts`, `questionMedia.ts`
- `src/pages/app/mock-test/ExamPapers.tsx`, `TestConfigure.tsx`, `TestSession.tsx`
- `src/hooks/useDocuments.ts`, `src/pages/app/documents/Documents.tsx`
- `src/lib/documents/interviewContext.ts`
- `src/hooks/useLiveCopilot.ts`, `useSessionOrchestrator.ts`
- `supabase/functions/parse-document/index.ts`
- Migrations: seed questions, documents bucket
