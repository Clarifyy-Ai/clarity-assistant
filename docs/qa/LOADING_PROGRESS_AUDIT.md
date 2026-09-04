# Global Loading / Progress Audit

**Date:** 2026-09-04  
**Final status:** PARTIALLY FIXED → **FIXED** for major long-running workflows (no fake %)

## Global Loading Audit

| Feature | Progress type | Notes |
|---------|---------------|-------|
| Gov exam paper generation | Determinate stages (no invent %) | `JobProgressCard` + real `progress_stage` |
| Document upload | Indeterminate | Fake `setInterval` % removed |
| Document processing jobs | Real stages | Library `JobProgressCard` |
| Company research | Real stage messages | Adapter + card |
| Debrief | Server stages | `DebriefLoadingSteps` uses job |
| Scorecard | Indeterminate stages | Processing → Evaluating → Building |
| Prep AI (STAR, SD, Rephraser, Project, Answer Bank) | Indeterminate named stages | `PrepToolShell` / `ProcessingStatus` |
| Mock Interview | Indeterminate stages | Setup + next Q + TTS |
| Live Practice Coach hints | Compact indeterminate | “Preparing hint…” |
| Assessments start / autosave | Indeterminate / inline save | `ProcessingStatus` / `InlineSaveStatus` |
| Billing Razorpay | Indeterminate phases | Prepare → wait → verify → confirm |
| Calendar | Indeterminate labels | Check / connect / sync |
| Uploads (`UploadZone`) | Indeterminate default | Real % only if browser provides |

## Features Using Determinate Progress

| Feature | Progress source | UI |
|---------|-----------------|-----|
| Gov paper | `gov_paper_generation_jobs.progress_stage` | `JobProgressCard` checklist |
| Document jobs | `document_processing_jobs.status` as stage | `JobProgressCard` |
| Browser upload (when wired) | XHR/bytes only | optional `progress` on `JobProgress` |

## Features Using Indeterminate Progress

| Operation | Stage message examples |
|-----------|------------------------|
| Resume upload | Uploading… |
| STAR / SD / Rephraser | Polishing / Generating sections… |
| Scorecard | Processing session / Evaluating / Building |
| Mock next Q | Preparing your next interview question… |
| Live hint | Preparing hint… |
| Payment | Preparing checkout… / Waiting for payment… |
| Calendar | Syncing interview… |

## Features With Missing Loading UX

- Optional Edge TTS server progress (stub only)
- Fine-grained numeric % on AI single-shot calls (intentionally omitted — no backend %)
- Full viewport matrix browser QA screenshots (manual)

## Files Changed (primary)

- `src/lib/async/*` — JobProgress, adapters, AsyncOpState, useJobProgress, waitMessaging, aiOpStages
- `src/components/async/*` — ProcessingStatus, JobProgressCard, FullPageProcessingState, InlineSaveStatus, AsyncOperationBanner
- Documents / UploadZone / supabase uploadFile (no fake %)
- GenerateGovPaper, DocumentLibrary, CompanyProfile, DebriefLoadingSteps, DebriefDetail
- PrepToolShell + prep/answer-bank tools, MockSession, OverlayHintPanel, Scorecard
- AssessmentReview, TestSession, SettingsBilling, Interviews

## Tests

```bash
npx vitest run src/test/lib/async/jobProgress.test.ts
```

Expected: pass (normalize, adapters, no invented progress).

## Browser Verification

Manual QA recommended at 360×800, 414×896, 768×1024, 1366×768, 1920×1080 for JobProgressCard wrapping and overlay compact status.

## Final Status

**FIXED** for major workflows: durable jobs show real stages; AI/sync use indeterminate named stages; **zero fake percentage timers**.
